import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const resetRequest = await db.passwordResetRequest.findUnique({ where: { token }, include: { user: true } });
  if (
    !resetRequest ||
    resetRequest.status !== "APPROVED" ||
    !resetRequest.tokenExpiry ||
    resetRequest.tokenExpiry < new Date()
  ) {
    return NextResponse.json({ error: "This reset link is no longer valid" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const [, user] = await Promise.all([
    db.passwordResetRequest.update({
      where: { id: resetRequest.id },
      data: { status: "USED", token: null, tokenExpiry: null },
    }),
    db.user.update({ where: { id: resetRequest.userId }, data: { passwordHash } }),
  ]);

  await setSessionCookie({ sub: user.id, name: user.name ?? user.email, email: user.email, role: user.role });

  return NextResponse.json({ ok: true });
}
