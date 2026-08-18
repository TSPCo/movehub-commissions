import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { RESET_TTL_MS } from "@/lib/tokens";
import { getAppUrl } from "@/lib/url";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/emailTemplates";

const GENERIC_MESSAGE = "If an account exists for that email, a reset link is on its way.";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE") {
    // Auto-send rather than requiring admin approval (automated 2026-08-16
    // per Mat's request, matching movehub-holidays). Safe because the link
    // only ever goes to that account's own registered inbox, same as any
    // standard "forgot password" flow.
    const token = generateToken();
    await db.passwordResetRequest.create({
      data: { userId: user.id, status: "APPROVED", token, tokenExpiry: new Date(Date.now() + RESET_TTL_MS) },
    });
    const resetUrl = new URL(`/reset-password/${token}`, getAppUrl(request)).toString();
    await sendEmail({ to: user.email, ...passwordResetEmail({ name: user.name ?? user.email, resetUrl }) });
  }

  // Always return the same message, whether or not the account exists, so this endpoint can't be used to enumerate staff emails.
  return NextResponse.json({ message: GENERIC_MESSAGE });
}
