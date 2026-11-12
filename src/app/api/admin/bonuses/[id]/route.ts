import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.bonusPayment.findUnique({ where: { id }, select: { id: true, selfBilledLineId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Financial record: once on a self-billed invoice it stays. Void the draft
  // first, or correct an issued invoice with a credit note.
  if (existing.selfBilledLineId) {
    return NextResponse.json({ error: "This bonus is on a self-billed invoice. Void that draft first, or raise a credit note if it's been accepted." }, { status: 409 });
  }
  await db.bonusPayment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
