import { NextResponse } from "next/server";
import { authorise } from "@/lib/bankDetailsApi";
import { signAgreement } from "@/lib/selfBilling/agreements";
import { SelfBillingError } from "@/lib/selfBilling/lifecycle";

/** Progressor signs: tick box + typed name, timestamped, with the exact text stored. */
export async function POST(request: Request) {
  const auth = await authorise(null);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { signedName?: string; agreed?: boolean };
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const a = await signAgreement(auth.userId, String(body.signedName ?? ""), body.agreed === true, ip);
    return NextResponse.json({ ok: true, id: a.id });
  } catch (err) {
    if (err instanceof SelfBillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
