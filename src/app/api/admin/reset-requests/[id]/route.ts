import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, generateToken } from "@/lib/auth";
import { RESET_TTL_MS } from "@/lib/tokens";
import { getAppUrl } from "@/lib/url";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action !== "approve" && action !== "dismiss") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const existing = await db.passwordResetRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending requests can be reviewed" }, { status: 400 });
  }

  if (action === "dismiss") {
    const updated = await db.passwordResetRequest.update({
      where: { id },
      data: { status: "DISMISSED", resolvedById: session.sub, resolvedAt: new Date() },
    });
    return NextResponse.json({ request: updated });
  }

  const token = generateToken();
  const updated = await db.passwordResetRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      token,
      tokenExpiry: new Date(Date.now() + RESET_TTL_MS),
      resolvedById: session.sub,
      resolvedAt: new Date(),
    },
  });

  const resetUrl = new URL(`/reset-password/${token}`, getAppUrl(request)).toString();

  return NextResponse.json({ request: updated, resetUrl });
}
