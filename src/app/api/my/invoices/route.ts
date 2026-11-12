import { NextRequest, NextResponse, after } from "next/server";
import { runInvoiceCheck } from "@/lib/invoiceCheck";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEarnedBreakdown, getPaidPence, getCreditedPence, getUploadAllowancePence, MAX_INVOICE_FILE_BYTES, ALLOWED_INVOICE_MIME_TYPES } from "@/lib/payments";
import { formatPence } from "@/lib/money";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await db.staffInvoice.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    select: { id: true, amountPence: true, fileName: true, status: true, paidAt: true, createdAt: true },
  });

  const [earned, bonuses, paidPence, upload, creditedPence] = await Promise.all([
    getEarnedBreakdown(session.sub),
    db.bonusPayment.findMany({
      where: { userId: session.sub },
      orderBy: { awardedAt: "desc" },
      select: { id: true, amountPence: true, note: true, type: true, awardedAt: true },
    }),
    getPaidPence(session.sub),
    getUploadAllowancePence(session.sub),
    getCreditedPence(session.sub),
  ]);
  const totalPaidPence = paidPence;

  return NextResponse.json({
    commissionEarnedPence: earned.commissionPence,
    bonusPence: earned.bonusPence,
    lifetimeEarnedPence: earned.totalPence,
    totalPaidPence,
    creditedPence,
    outstandingPence: earned.totalPence - creditedPence - totalPaidPence,
    // Self-billing: commission in agreement months is invoiced by Move Hub, so
    // the upload form only offers what's left from months outside them.
    hasAgreement: upload.hasAgreement,
    uploadAllowancePence: Math.max(upload.allowancePence, 0),
    bonuses: bonuses.map((b) => ({ ...b, awardedAt: b.awardedAt.toISOString() })),
    invoices: invoices.map((i) => ({ ...i, createdAt: i.createdAt.toISOString(), paidAt: i.paidAt?.toISOString() ?? null })),
  });
}

/** Staff uploading their own invoice — doesn't have to line up with any single month. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const amountPence = Math.round(Number(form?.get("amountPence")));
  const file = form?.get("file");

  if (!Number.isFinite(amountPence) || amountPence <= 0) {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (file.size > MAX_INVOICE_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (10MB max)" }, { status: 400 });
  }
  if (!ALLOWED_INVOICE_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF, PNG, or JPG files are accepted" }, { status: 400 });
  }

  // Sense-check against real completed matters: can't invoice for more than
  // has actually been earned, minus anything already invoiced (paid or still
  // pending) — the pending half of that matters too, or someone could submit
  // the same amount twice before the first one's marked paid.
  // Months covered by a self-billing agreement are excluded — Move Hub invoices those.
  const { allowancePence: availablePence, hasAgreement } = await getUploadAllowancePence(session.sub);

  if (amountPence > availablePence) {
    return NextResponse.json(
      {
        error: hasAgreement
          ? `That's more than you can invoice yourself. Commission from your self-billing months is invoiced by Move Hub; from other months you can invoice up to ${formatPence(Math.max(availablePence, 0))}.`
          : `That's more than you're currently owed — based on completed matters and any bonuses, you can invoice up to ${formatPence(Math.max(availablePence, 0))}.`,
      },
      { status: 400 }
    );
  }

  const fileData = Buffer.from(await file.arrayBuffer());

  const invoice = await db.staffInvoice.create({
    data: {
      userId: session.sub,
      uploadedById: session.sub,
      amountPence,
      fileName: file.name,
      fileMimeType: file.type,
      fileData,
    },
  });

  // Runs after the response is sent — reading the file takes a few seconds and
  // the result is advisory, so the upload itself never waits on it.
  after(() => runInvoiceCheck(invoice.id).catch((err) => console.error("Invoice check failed", invoice.id, err)));

  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        amountPence: invoice.amountPence,
        fileName: invoice.fileName,
        status: invoice.status,
        createdAt: invoice.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
