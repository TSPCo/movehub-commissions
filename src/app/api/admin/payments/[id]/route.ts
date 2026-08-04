import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (body?.status !== "PAID" && body?.status !== "PENDING") {
    return NextResponse.json({ error: "status must be PAID or PENDING" }, { status: 400 });
  }

  const invoice = await db.staffInvoice.update({
    where: { id },
    data: { status: body.status, paidAt: body.status === "PAID" ? new Date() : null },
  });

  return NextResponse.json({ invoice: { id: invoice.id, status: invoice.status, paidAt: invoice.paidAt?.toISOString() ?? null } });
}

/** Admin can remove any invoice — e.g. wrong amount/file uploaded by mistake. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.staffInvoice.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.staffInvoice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
