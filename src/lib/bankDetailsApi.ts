import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { BankDetailsUnavailableError, bankDetailsConfigured, getBankDetails, saveBankDetails } from "@/lib/bankDetails";
import { formatSortCode, maskAccountNumber, maskSortCode, parseBankDetails } from "@/lib/bankMatch";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

/**
 * Who's asking, re-read from the database rather than trusted from the session
 * cookie — a cookie stays valid for 7 days after someone is disabled or demoted,
 * and bank details are worth the extra query.
 */
async function currentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findFirst({ where: { id: session.sub, status: "ACTIVE" }, select: { id: true, role: true } });
}

/** Only the account owner or an admin may see or change someone's bank details. */
export async function authorise(targetUserId: string | null) {
  const me = await currentUser();
  if (!me) return { error: json({ error: "Unauthorized" }, 401) };
  const userId = targetUserId ?? me.id;
  if (userId !== me.id && me.role !== "ADMIN") return { error: json({ error: "Forbidden" }, 403) };
  if (userId !== me.id && !(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
    return { error: json({ error: "Not found" }, 404) };
  }
  return { me, userId };
}

export async function handleGet(targetUserId: string | null, reveal: boolean) {
  const auth = await authorise(targetUserId);
  if ("error" in auth) return auth.error;
  if (!bankDetailsConfigured()) return json({ configured: false, details: null });

  try {
    const saved = await getBankDetails(auth.userId);
    if (!saved) return json({ configured: true, details: null });
    const { details } = saved;
    return json({
      configured: true,
      details: {
        accountName: details.accountName,
        sortCode: reveal ? formatSortCode(details.sortCode) : maskSortCode(details.sortCode),
        accountNumber: reveal ? details.accountNumber : maskAccountNumber(details.accountNumber),
        revealed: reveal,
        updatedAt: saved.updatedAt.toISOString(),
        lastChangedAt: saved.lastChangedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof BankDetailsUnavailableError) return json({ configured: false, details: null });
    console.error("[bank] couldn't read saved details", auth.userId, err);
    return json({ configured: true, details: null, unreadable: true });
  }
}

export async function handlePut(targetUserId: string | null, body: unknown) {
  const auth = await authorise(targetUserId);
  if ("error" in auth) return auth.error;
  if (!bankDetailsConfigured()) return json({ error: "Bank details aren't set up on this server yet." }, 503);

  const parsed = parseBankDetails((body ?? {}) as Record<string, unknown>);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const { changed } = await saveBankDetails({ userId: auth.userId, details: parsed.details, editedById: auth.me.id });
  return json({ ok: true, changed });
}
