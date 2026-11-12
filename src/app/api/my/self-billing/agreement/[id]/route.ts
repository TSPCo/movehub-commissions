import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorise } from "@/lib/bankDetailsApi";
import { endAgreement } from "@/lib/selfBilling/agreements";
import { SelfBillingError } from "@/lib/selfBilling/lifecycle";

/** Progressor gives notice to end their own agreement (14 days, to the end of that month). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorise(null);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const owned = await db.selfBillingAgreement.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  try {
    await endAgreement(id, auth.userId, String(body.reason ?? ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SelfBillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
