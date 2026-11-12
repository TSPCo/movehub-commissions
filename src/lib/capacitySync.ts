import "server-only";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

/**
 * Commissions is the master copy of each progressor's max open cases; Sales
 * Progression (app.move-hub.co.uk) shows it as StaffUser.capacity on its
 * dashboard and Imports page. Every change here is pushed there, matched by
 * email, over a shared-secret webhook — same shape as peerSync.ts.
 *
 * Env: SALES_PROGRESSION_URL (e.g. https://app.move-hub.co.uk) and
 * CAPACITY_SYNC_SECRET (same value set on the Sales Progression service).
 */

const NOT_CONFIGURED = "Sales Progression link isn't set up on this server yet";

function config() {
  const url = process.env.SALES_PROGRESSION_URL?.trim();
  const secret = process.env.CAPACITY_SYNC_SECRET?.trim();
  return url && secret ? { url, secret } : null;
}

export const capacitySyncConfigured = () => config() !== null;

export type PushResult = { ok: true } | { ok: false; error: string };

/** Push one person's figure. Never throws; the outcome is recorded on their StaffDetails row. */
export async function pushCapacity(userId: string): Promise<PushResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, staffDetails: { select: { maxOpenCases: true } } },
  });
  if (!user?.staffDetails) return { ok: false, error: "No details saved" };

  const result = await send(user.email, user.staffDetails.maxOpenCases);
  await db.staffDetails.update({
    where: { userId },
    data: result.ok ? { capacitySyncedAt: new Date(), capacitySyncError: null } : { capacitySyncError: result.error },
  });
  if (!result.ok) console.error(`[capacitySync] push failed for ${user.email}: ${result.error}`);
  return result;
}

async function send(email: string, capacity: number | null): Promise<PushResult> {
  const cfg = config();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };
  try {
    const res = await fetch(new URL("/api/webhooks/capacity", cfg.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-capacity-sync-secret": cfg.secret },
      body: JSON.stringify({ email, capacity }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { ok: false, error: "No Sales Progression user with this email" };
    if (!res.ok) return { ok: false, error: `Sales Progression returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Sales Progression unreachable (${err instanceof Error ? err.message : "error"})` };
  }
}

/** Current capacity figures held in Sales Progression, for the one-off import. */
export async function fetchSalesProgressionCapacities(): Promise<{ email: string; capacity: number | null }[]> {
  const cfg = config();
  if (!cfg) throw new Error(NOT_CONFIGURED);
  const res = await fetch(new URL("/api/webhooks/capacity", cfg.url), {
    headers: { "x-capacity-sync-secret": cfg.secret },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sales Progression returned ${res.status}`);
  const body = (await res.json()) as { users?: { email: string; capacity: number | null }[] };
  return body.users ?? [];
}

export function safeEqual(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
