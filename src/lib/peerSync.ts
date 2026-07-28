import "server-only";

export const PEER_NAME = "commissions";
const OTHER_PEER_NAME = "holidays";

type PeerEvent = "invited" | "disabled" | "enabled" | "deleted";

/**
 * Best-effort push to movehub-holidays so adding/disabling/deleting a staff
 * member here doesn't have to be repeated over there. Never throws — a peer
 * outage must not break the local action (invite/disable/delete) that
 * triggered it; failures are just logged.
 */
export async function notifyPeer(event: PeerEvent, user: { email: string; role: "ADMIN" | "STAFF" }) {
  const peerUrl = process.env.PEER_APP_URL?.trim();
  const secret = process.env.STAFF_SYNC_SECRET?.trim();
  if (!peerUrl || !secret) return;

  try {
    const res = await fetch(new URL("/api/webhooks/staff-sync", peerUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-staff-sync-secret": secret },
      body: JSON.stringify({ event, email: user.email, role: user.role }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[peerSync] ${OTHER_PEER_NAME} rejected "${event}" for ${user.email}: ${res.status}`);
  } catch (err) {
    console.error(`[peerSync] ${OTHER_PEER_NAME} unreachable for "${event}" on ${user.email}:`, err);
  }
}

export function verifyPeerSecret(request: Request) {
  const secret = request.headers.get("x-staff-sync-secret");
  return Boolean(secret) && secret === process.env.STAFF_SYNC_SECRET;
}
