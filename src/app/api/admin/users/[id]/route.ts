import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { notifyPeer } from "@/lib/peerSync";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  intouchFeeEarnerName: true,
  createdAt: true,
  peerDeleteRequestedAt: true,
  peerDeleteRequestedFrom: true,
} as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);

  const data: Record<string, unknown> = {};

  if (typeof body?.intouchFeeEarnerName === "string") {
    data.intouchFeeEarnerName = body.intouchFeeEarnerName.trim() || null;
  }

  if (typeof body?.role === "string") {
    if (id === session.sub && body.role !== "ADMIN") {
      return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 400 });
    }
    if (body.role === "ADMIN" || body.role === "STAFF") data.role = body.role;
  }

  if (typeof body?.status === "string") {
    if (id === session.sub && body.status !== "ACTIVE") {
      return NextResponse.json({ error: "You can't disable your own account" }, { status: 400 });
    }
    if (body.status === "ACTIVE" || body.status === "DISABLED") {
      data.status = body.status;
      // Reactivating clears any pending cross-app deletion flag — the admin
      // has decided to keep this person despite the other app deleting them.
      if (body.status === "ACTIVE") {
        data.peerDeleteRequestedAt = null;
        data.peerDeleteRequestedFrom = null;
      }
    }
  }

  // Keep someone disabled but stop flagging them for deletion, without
  // reactivating their account.
  if (body?.dismissPeerDeleteFlag === true) {
    data.peerDeleteRequestedAt = null;
    data.peerDeleteRequestedFrom = null;
  }

  if (typeof body?.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    data.passwordHash = await hashPassword(body.password);
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });

  if (typeof data.status === "string") {
    await notifyPeer(data.status === "ACTIVE" ? "enabled" : "disabled", { email: user.email, role: user.role });
  }

  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (id === session.sub) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deleting cascades their MonthlySnapshots; any CompletedMatter rows keep
  // existing but revert to unattributed (userId: null) rather than being
  // deleted themselves — the InTouch matter still really completed.
  await db.user.delete({ where: { id } });

  await notifyPeer("deleted", { email: existing.email, role: existing.role });

  return NextResponse.json({ ok: true });
}
