import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLifetimeEarnedPence, MAX_INVOICE_FILE_BYTES, ALLOWED_INVOICE_MIME_TYPES } from "@/lib/payments";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await db.staffInvoice.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    select: { id: true, amountPence: true, fileName: true, status: true, paidAt: true, createdAt: true },
  });

  const lifetimeEarnedPence = await getLifetimeEarnedPence(session.sub);
  const totalPaidPence = invoices.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.amountPence, 0);

  return NextResponse.json({
    lifetimeEarnedPence,
    totalPaidPence,
    outstandingPence: lifetimeEarnedPence - totalPaidPence,
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
