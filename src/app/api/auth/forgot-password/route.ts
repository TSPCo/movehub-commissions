import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const GENERIC_MESSAGE = "If an account exists for that email, an admin has been notified and will be in touch with a reset link.";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE") {
    const existingPending = await db.passwordResetRequest.findFirst({
      where: { userId: user.id, status: "PENDING" },
    });
    if (!existingPending) {
      await db.passwordResetRequest.create({ data: { userId: user.id } });
    }
  }

  // Always return the same message, whether or not the account exists, so this endpoint can't be used to enumerate staff emails.
  return NextResponse.json({ message: GENERIC_MESSAGE });
}
