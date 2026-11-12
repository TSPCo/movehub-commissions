import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { endAgreement } from "@/lib/selfBilling/agreements";
import { SelfBillingError } from "@/lib/selfBilling/lifecycle";

/** Admin ends an agreement (14 days' notice, self-billing stops at the end of that month). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  try {
    await endAgreement(id, session.sub, String(body.reason ?? ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SelfBillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
