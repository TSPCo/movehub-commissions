import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorise } from "@/lib/bankDetailsApi";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorise(null);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const inv = await db.selfBilledInvoice.findFirst({ where: { id, userId: auth.userId, pdfData: { not: null } }, select: { number: true, pdfData: true } });
  if (!inv?.pdfData) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(inv.pdfData), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
