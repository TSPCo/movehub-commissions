import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorise } from "@/lib/bankDetailsApi";
import { signingState } from "@/lib/selfBilling/agreements";
import { invoiceInclude, serializeAgreement, serializeInvoice } from "@/lib/selfBilling/serialize";

export async function GET() {
  const auth = await authorise(null);
  if ("error" in auth) return auth.error;
  const userId = auth.userId;

  const [state, invoices] = await Promise.all([
    signingState(userId),
    db.selfBilledInvoice.findMany({
      // Drafts are Move Hub's working copies; voided drafts never existed as far as the progressor is concerned.
      where: { userId, status: { not: "DRAFT" }, NOT: { status: "VOID", number: null } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }],
      include: invoiceInclude,
    }),
  ]);

  return NextResponse.json(
    {
      agreements: state.agreements.map((a) => serializeAgreement(a)).reverse(),
      canSign: state.canSign,
      isRenewal: state.isRenewal,
      missing: state.missing,
      preview: state.preview
        ? { startDate: state.preview.startDate.toISOString().slice(0, 10), endDate: state.preview.endDate.toISOString().slice(0, 10), text: state.preview.text }
        : null,
      invoices: invoices.map((i) => serializeInvoice(i)),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
