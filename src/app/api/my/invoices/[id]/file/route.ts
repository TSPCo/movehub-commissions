import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const invoice = await db.staffInvoice.findUnique({
    where: { id },
    select: { userId: true, fileData: true, fileMimeType: true, fileName: true },
  });
  if (!invoice || invoice.userId !== session.sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(invoice.fileData), {
    headers: {
      "Content-Type": invoice.fileMimeType,
      "Content-Disposition": `attachment; filename="${invoice.fileName.replace(/"/g, "")}"`,
    },
  });
}
