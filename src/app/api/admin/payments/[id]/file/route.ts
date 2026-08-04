import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await db.staffInvoice.findUnique({
    where: { id },
    select: { fileData: true, fileMimeType: true, fileName: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(invoice.fileData), {
    headers: {
      "Content-Type": invoice.fileMimeType,
      "Content-Disposition": `attachment; filename="${invoice.fileName.replace(/"/g, "")}"`,
    },
  });
}
