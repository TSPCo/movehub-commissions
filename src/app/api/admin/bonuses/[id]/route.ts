import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.bonusPayment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.bonusPayment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
