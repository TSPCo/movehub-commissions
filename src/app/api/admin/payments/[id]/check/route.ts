import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runInvoiceCheck } from "@/lib/invoiceCheck";

/** Re-runs the automatic check — e.g. after a completions sync has picked up a matter the first check couldn't find. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await db.staffInvoice.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await runInvoiceCheck(id);
  const invoice = await db.staffInvoice.findUnique({
    where: { id },
    select: { checkStatus: true, checkResult: true, checkedAt: true },
  });
  return NextResponse.json({ invoice: { ...invoice, checkedAt: invoice?.checkedAt?.toISOString() ?? null } });
}
