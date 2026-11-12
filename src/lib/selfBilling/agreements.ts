import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { missingInvoiceFields } from "@/lib/staffDetails";
import { agreementEndedEmail, agreementEndingEmail, agreementSignedEmail } from "@/lib/emailTemplates";
import { AGREEMENT_VERSION, MOVE_HUB, agreementPeriod, isRolloutMonth, renderAgreement, type Supplier } from "./agreementText";
import { SelfBillingError, appUrl } from "./lifecycle";
import { lastDayOfMonth, londonDate } from "./workingDays";

const RENEW_WINDOW_DAYS = 60;
const REMINDER_DAYS = 30;
const NOTICE_DAYS = 14;
const DAY = 86400000;

const day = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** The agreement covering a date, if any (agreements never overlap). */
export function agreementCovering<T extends { startDate: Date; endDate: Date }>(agreements: T[], at: Date): T | null {
  return agreements.find((a) => a.startDate <= at && at < new Date(a.endDate.getTime() + DAY)) ?? null;
}

/**
 * What the progressor can do right now: sign a first agreement, sign a renewal
 * (within 60 days of the current one ending), or nothing (already covered).
 * Returns the text they'd be signing, with the dates it would run.
 */
export async function signingState(userId: string, now = new Date()) {
  const [user, agreements, settings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { role: true, staffDetails: true } }),
    db.selfBillingAgreement.findMany({ where: { userId }, orderBy: { startDate: "asc" } }),
    getSettings(),
  ]);
  // One ended before it started (endDate < startDate) never took effect.
  const effective = agreements.filter((a) => a.endDate >= a.startDate);
  const current = agreementCovering(effective, now);
  const upcoming = effective.find((a) => a.startDate > now) ?? null;
  const latest = effective[effective.length - 1] ?? null;
  const missing = missingInvoiceFields(user?.staffDetails);

  let canSign = user?.role === "STAFF" && !upcoming && missing.length === 0;
  let notBefore: Date | undefined;
  if (canSign && latest && latest.endDate.getTime() + DAY > now.getTime()) {
    // Still running: only offer a renewal near the end, starting the day after.
    canSign = latest.endDate.getTime() - now.getTime() <= RENEW_WINDOW_DAYS * DAY;
    notBefore = new Date(latest.endDate.getTime() + DAY);
  }

  let preview: { startDate: Date; endDate: Date; text: string } | null = null;
  if (canSign) {
    // Launch: a first-ever agreement signed in the rollout month covers that month too.
    const startThisMonth = !latest && isRolloutMonth(now);
    const period = agreementPeriod(now, notBefore, startThisMonth);
    preview = { ...period, text: renderAgreement({ supplier: toSupplier(user!.staffDetails!), ...period, ratePence: settings.commissionPerMatterPence }) };
  }
  return { agreements, current, upcoming, canSign, missing, preview, isRenewal: Boolean(notBefore), isStaff: user?.role === "STAFF" };
}

function toSupplier(d: NonNullable<Awaited<ReturnType<typeof db.staffDetails.findUnique>>>): Supplier {
  return { legalName: d.legalName!, addressLine1: d.addressLine1!, addressLine2: d.addressLine2, city: d.city!, postcode: d.postcode!, vatRegistered: d.vatRegistered, vatNumber: d.vatRegistered ? d.vatNumber : null };
}

export async function signAgreement(userId: string, signedName: string, agreed: boolean, ip: string | null) {
  if (!agreed) throw new SelfBillingError("Tick the box to confirm you agree");
  const name = signedName.replace(/\s+/g, " ").trim();
  if (name.length < 3) throw new SelfBillingError("Type your full name to sign");
  const state = await signingState(userId);
  if (!state.canSign || !state.preview) {
    if (!state.isStaff) throw new SelfBillingError("Only progressors sign self-billing agreements");
    throw new SelfBillingError(state.missing.length ? `Complete your invoice details first: ${state.missing.join(", ")}` : "There's no agreement to sign right now");
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, staffDetails: true } });
  const supplier = toSupplier(user!.staffDetails!);

  const agreement = await db.selfBillingAgreement.create({
    data: {
      userId,
      startDate: state.preview.startDate,
      endDate: state.preview.endDate,
      version: AGREEMENT_VERSION,
      agreementText: state.preview.text,
      supplierSnapshot: supplier,
      signedName: name,
      signedIp: ip,
      moveHubSignatory: `${MOVE_HUB.signatoryName}, ${MOVE_HUB.signatoryPosition}`,
    },
  });

  const who = user!.name ?? user!.email;
  const start = day(agreement.startDate);
  const end = day(agreement.endDate);
  const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
  await sendEmail({ to: user!.email, ...agreementSignedEmail({ name: who, start, end, forAdmin: false }) });
  await Promise.all(admins.map((a) => sendEmail({ to: a.email, ...agreementSignedEmail({ name: who, start, end, forAdmin: true }) })));
  return agreement;
}

/**
 * Either side can end with 14 days' notice. Self-billing stops at the end of
 * the month the notice runs out in, so no month is split; anything dated up to
 * then is still invoiced by Move Hub. An agreement that hasn't started yet is
 * simply ended before it begins.
 */
export async function endAgreement(id: string, byUserId: string, reason: string, now = new Date()) {
  const a = await db.selfBillingAgreement.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } } } });
  if (!a || a.endedAt) throw new SelfBillingError("Agreement not found or already ended");
  const why = reason.trim().slice(0, 500);
  if (!why) throw new SelfBillingError("Give a reason for ending it");

  let endDate: Date;
  if (a.startDate > now) {
    endDate = new Date(a.startDate.getTime() - DAY); // never takes effect
  } else {
    const noticeEnds = londonDate(new Date(now.getTime() + NOTICE_DAYS * DAY));
    const last = lastDayOfMonth(noticeEnds.y, noticeEnds.m);
    endDate = new Date(Math.min(Date.UTC(last.y, last.m - 1, last.d), a.endDate.getTime()));
  }
  await db.selfBillingAgreement.update({ where: { id }, data: { endedAt: now, endedById: byUserId, endReason: why, endDate } });

  const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
  const email = agreementEndedEmail({ name: a.user?.name ?? a.user?.email ?? "A progressor", lastDay: endDate < a.startDate ? "(it hadn't started)" : day(endDate), reason: why });
  await Promise.all([...(a.user ? [a.user.email] : []), ...admins.map((x) => x.email)].map((to) => sendEmail({ to, ...email })));
}

/** Daily: remind progressor + admins 30 days before an agreement ends with no renewal signed. */
export async function sendRenewalReminders(now = new Date()) {
  const soon = await db.selfBillingAgreement.findMany({
    where: { endedAt: null, reminderSentAt: null, userId: { not: null }, endDate: { gte: now, lte: new Date(now.getTime() + REMINDER_DAYS * DAY) } },
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
  });
  const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
  let sent = 0;
  for (const a of soon) {
    if (!a.user || a.user.status === "DISABLED") continue;
    const renewed = await db.selfBillingAgreement.count({ where: { userId: a.userId, startDate: { gt: a.endDate } } });
    if (!renewed) {
      const who = a.user.name ?? a.user.email;
      const end = day(a.endDate);
      await sendEmail({ to: a.user.email, ...agreementEndingEmail({ name: who, end, forAdmin: false, url: `${appUrl()}/self-billing` }) });
      await Promise.all(admins.map((x) => sendEmail({ to: x.email, ...agreementEndingEmail({ name: who, end, forAdmin: true, url: `${appUrl()}/admin/self-billing` }) })));
      sent++;
    }
    await db.selfBillingAgreement.update({ where: { id: a.id }, data: { reminderSentAt: now } });
  }
  return sent;
}
