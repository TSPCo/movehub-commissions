import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { INVITE_TTL_MS } from "@/lib/tokens";
import { verifyPeerSecret } from "@/lib/peerSync";

const EVENTS = ["invited", "disabled", "enabled", "deleted"] as const;

/**
 * Receives staff add/disable/enable/delete events from movehub-holidays so a
 * team member only has to be entered once. This applies changes directly
 * against the DB and must never call notifyPeer itself, or a change would
 * ping-pong back and forth between the two apps.
 *
 * "deleted" never hard-deletes a real account on its own — see the inline
 * comment below for why.
 */
export async function POST(request: NextRequest) {
  if (!verifyPeerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const event = body?.event;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role === "ADMIN" ? "ADMIN" : "STAFF";

  if (!email || !EVENTS.includes(event)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event === "invited") {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ ok: true, skipped: "already exists" });

    await db.user.create({
      data: {
        email,
        role,
        status: "INVITED",
        inviteToken: generateToken(),
        inviteTokenExpiry: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return NextResponse.json({ ok: true });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) return NextResponse.json({ ok: true, skipped: "no matching user" });

  if (event === "disabled") {
    if (existing.status === "ACTIVE") {
      await db.user.update({ where: { id: existing.id }, data: { status: "DISABLED" } });
    }
    return NextResponse.json({ ok: true });
  }

  if (event === "enabled") {
    if (existing.status === "DISABLED") {
      await db.user.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", peerDeleteRequestedAt: null, peerDeleteRequestedFrom: null },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // event === "deleted"
  if (existing.status === "INVITED") {
    // Never activated here either — nothing real to lose, safe to remove outright.
    await db.user.delete({ where: { id: existing.id } });
  } else {
    // A real account, possibly with commission history — lock them out
    // immediately, but require an admin to explicitly confirm the delete
    // here rather than a remote app silently destroying local data.
    await db.user.update({
      where: { id: existing.id },
      data: { status: "DISABLED", peerDeleteRequestedAt: new Date(), peerDeleteRequestedFrom: "holidays" },
    });
  }
  return NextResponse.json({ ok: true });
}
