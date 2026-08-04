import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLifetimeEarnedPence, MAX_INVOICE_FILE_BYTES, ALLOWED_INVOICE_MIME_TYPES } from "@/lib/payments";

export async function GET() {
  const users = await db.user.findMany({
    where: { status: { not: "DISABLED" }, intouchFeeEarnerName: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      invoices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amountPence: true,
          fileName: true,
          status: true,
          paidAt: true,
          createdAt: true,
          uploadedBy: { select: { name: true, email: true } },
        },
      },
    },
  });

  const rows = await Promise.all(
    users.map(async (u) => {
      const lifetimeEarnedPence = await getLifetimeEarnedPence(u.id);
      const totalPaidPence = u.invoices.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.amountPence, 0);
      return {
        userId: u.id,
        name: u.name ?? u.email,
        email: u.email,
        lifetimeEarnedPence,
        totalPaidPence,
        outstandingPence: lifetimeEarnedPence - totalPaidPence,
        invoices: u.invoices.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
          paidAt: i.paidAt?.toISOString() ?? null,
        })),
      };
    })
  );

  return NextResponse.json({ rows });
}

/** Admin uploading an invoice on a staff member's behalf. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const userId = form?.get("userId");
  const amountPence = Math.round(Number(form?.get("amountPence")));
  const file = form?.get("file");

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
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

  const targetUser = await db.user.findUnique({ where: { id: userId } });
  if (!targetUser) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  const fileData = Buffer.from(await file.arrayBuffer());

  const invoice = await db.staffInvoice.create({
    data: {
      userId,
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
