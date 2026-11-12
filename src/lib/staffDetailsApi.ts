import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorise } from "@/lib/bankDetailsApi";
import { checkStaffCasesLimit, missingInvoiceFields, parseStaffDetails } from "@/lib/staffDetails";
import { capacitySyncConfigured, pushCapacity } from "@/lib/capacitySync";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

const select = {
  legalName: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  postcode: true,
  vatRegistered: true,
  vatNumber: true,
  maxOpenCases: true,
  capacitySyncedAt: true,
  capacitySyncError: true,
  updatedAt: true,
} as const;

async function load(userId: string) {
  const [details, history] = await Promise.all([
    db.staffDetails.findUnique({ where: { userId }, select }),
    db.capacityChange.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { fromValue: true, toValue: true, createdAt: true, changedBy: { select: { name: true, email: true } } },
    }),
  ]);
  return {
    details,
    missing: missingInvoiceFields(details),
    syncConfigured: capacitySyncConfigured(),
    capacityHistory: history.map((h) => ({
      fromValue: h.fromValue,
      toValue: h.toValue,
      at: h.createdAt.toISOString(),
      by: h.changedBy?.name ?? h.changedBy?.email ?? "Removed user",
    })),
  };
}

/** Same access rule as bank details: the person themselves, or an admin. */
export async function handleGet(targetUserId: string | null) {
  const auth = await authorise(targetUserId);
  if ("error" in auth) return auth.error;
  return json(await load(auth.userId));
}

export async function handlePut(targetUserId: string | null, body: unknown) {
  const auth = await authorise(targetUserId);
  if ("error" in auth) return auth.error;

  const parsed = parseStaffDetails((body ?? {}) as Record<string, unknown>);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const d = parsed.details;

  const before = await db.staffDetails.findUnique({ where: { userId: auth.userId }, select: { maxOpenCases: true, capacitySyncError: true } });
  const limitError = checkStaffCasesLimit(d.maxOpenCases, before?.maxOpenCases ?? null, auth.me.role === "ADMIN");
  if (limitError) return json({ error: limitError }, 400);
  const capacityChanged = (before?.maxOpenCases ?? null) !== d.maxOpenCases;

  await db.$transaction([
    db.staffDetails.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, ...d, updatedById: auth.me.id },
      update: { ...d, updatedById: auth.me.id },
    }),
    ...(capacityChanged
      ? [db.capacityChange.create({ data: { userId: auth.userId, fromValue: before?.maxOpenCases ?? null, toValue: d.maxOpenCases, changedById: auth.me.id } })]
      : []),
  ]);

  // Push on change, or retry if the last push failed.
  const sync = capacityChanged || before?.capacitySyncError ? await pushCapacity(auth.userId) : null;
  return json({ ok: true, capacityChanged, sync, ...(await load(auth.userId)) });
}
