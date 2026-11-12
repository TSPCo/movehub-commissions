import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  SelfBillingError,
  addAdjustment,
  confirmQueried,
  createCreditNote,
  issueInvoice,
  removeAdjustment,
  setPaid,
  voidAndRegenerate,
} from "@/lib/selfBilling/lifecycle";

type Body = { action?: string; text?: string; amountPence?: number; lineId?: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as Body;
  const text = String(b.text ?? "");
  try {
    switch (b.action) {
      case "issue":
        await issueInvoice(id, session.sub);
        break;
      case "confirm":
        await confirmQueried(id, text);
        break;
      case "reissue":
        return NextResponse.json({ ok: true, draft: await voidAndRegenerate(id, text || "Reissued after a query", true) });
      case "regenerate":
        return NextResponse.json({ ok: true, draft: await voidAndRegenerate(id, text || "Draft regenerated", true) });
      case "void":
        await voidAndRegenerate(id, text || "Draft discarded", false);
        break;
      case "adjust":
        await addAdjustment(id, text, Math.round(Number(b.amountPence)));
        break;
      case "remove-adjustment":
        await removeAdjustment(String(b.lineId));
        break;
      case "credit-note":
        await createCreditNote(id, session.sub, Math.round(Number(b.amountPence)), text);
        break;
      case "paid":
        await setPaid(id, true);
        break;
      case "unpaid":
        await setPaid(id, false);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SelfBillingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
