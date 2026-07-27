import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);

  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { inviteToken: token } });
  if (!user || user.status !== "INVITED" || !user.inviteTokenExpiry || user.inviteTokenExpiry < new Date()) {
    return NextResponse.json({ error: "This invite link is no longer valid" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      name: `${firstName} ${lastName}`,
      passwordHash,
      status: "ACTIVE",
      inviteToken: null,
      inviteTokenExpiry: null,
    },
  });

  await setSessionCookie({ sub: updated.id, name: updated.name!, email: updated.email, role: updated.role });

  return NextResponse.json({ ok: true });
}
