import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { selfBillingDraftsReadyEmail } from "@/lib/emailTemplates";
import { generateDrafts, previousMonth } from "@/lib/selfBilling/generate";
import { appUrl, applyDeemedAcceptance } from "@/lib/selfBilling/lifecycle";
import { sendRenewalReminders } from "@/lib/selfBilling/agreements";
import { formatDateOnly, issueDeadline } from "@/lib/selfBilling/workingDays";
import { monthLabel } from "@/lib/selfBilling/lines";

/**
 * Daily, after the 08:00 UTC completions sync (Railway cron, e.g. 30 8 * * *):
 *  1. Draft last month's self-billed invoices — idempotent, so only the first
 *     run of the month creates anything (later runs pick up anyone missed).
 *  2. Deemed acceptance: issued, no query after 5 working days → accepted.
 *  3. Renewal reminders 30 days before an agreement ends.
 * Same CRON_SECRET bearer check as the other cron routes.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { year, month } = previousMonth();
  const drafts = await generateDrafts(year, month);
  if (drafts.created.length) {
    const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
    const email = selfBillingDraftsReadyEmail({
      period: monthLabel(year, month),
      count: drafts.created.length,
      issueBy: formatDateOnly(issueDeadline(year, month)),
      warnings: drafts.created.filter((c) => c.warnings.length).length,
      url: `${appUrl()}/admin/self-billing`,
    });
    await Promise.all(admins.map((a) => sendEmail({ to: a.email, ...email })));
  }
  const deemedAccepted = await applyDeemedAcceptance();
  const remindersSent = await sendRenewalReminders();

  return NextResponse.json({ drafts: { created: drafts.created.length, skipped: drafts.skipped.length, unmatched: drafts.unmatchedCompletions }, deemedAccepted: deemedAccepted.length, remindersSent });
}
