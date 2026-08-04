import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** Staff can withdraw their own invoice, but only before it's been paid. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const invoice = await db.staffInvoice.findUnique({ where: { id } });
  if (!invoice || invoice.userId !== session.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Can't remove an invoice that's already been paid" }, { status: 400 });
  }

  await db.staffInvoice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
