import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/selfBilling/pdf";
import { missingInvoiceFields } from "@/lib/staffDetails";

/** The issued PDF, or for a draft a preview rendered on the fly (numbered "DRAFT"). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await db.selfBilledInvoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, user: { select: { staffDetails: true } }, agreement: { select: { startDate: true, endDate: true } }, original: { select: { number: true } } },
  });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let pdf: Buffer;
  if (inv.pdfData) {
    pdf = Buffer.from(inv.pdfData);
  } else {
    const d = inv.user?.staffDetails;
    if (!d || missingInvoiceFields(d).length) return NextResponse.json({ error: "Their invoice details are incomplete, so there's nothing to preview yet." }, { status: 400 });
    pdf = await renderInvoicePdf({
      kind: inv.kind,
      number: "DRAFT",
      issuedAt: new Date(),
      periodYear: inv.periodYear,
      periodMonth: inv.periodMonth,
      supplier: { legalName: d.legalName!, addressLine1: d.addressLine1!, addressLine2: d.addressLine2, city: d.city!, postcode: d.postcode!, vatRegistered: d.vatRegistered, vatNumber: d.vatNumber },
      lines: inv.lines.map((l) => ({ description: l.description, completionDate: l.completionDate, amountPence: l.amountPence })),
      netPence: inv.netPence,
      vatPence: inv.vatPence,
      grossPence: inv.grossPence,
      vatRatePercent: inv.vatRatePercent,
      originalNumber: inv.original?.number,
      agreement: inv.agreement,
    });
  }
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number ?? "draft"}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
