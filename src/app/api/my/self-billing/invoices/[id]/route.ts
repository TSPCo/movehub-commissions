import { NextResponse } from "next/server";
import { authorise } from "@/lib/bankDetailsApi";
import { SelfBillingError, acceptInvoice, queryInvoice } from "@/lib/selfBilling/lifecycle";

/** Progressor accepts or queries an issued invoice (both only work on their own, in ISSUED). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorise(null);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; note?: string };
  try {
    if (body.action === "accept") await acceptInvoice(id, auth.userId);
    else if (body.action === "query") await queryInvoice(id, auth.userId, String(body.note ?? ""));
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SelfBillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
