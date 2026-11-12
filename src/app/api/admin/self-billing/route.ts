import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateDrafts, previousMonth } from "@/lib/selfBilling/generate";
import { SelfBillingError, issueInvoice } from "@/lib/selfBilling/lifecycle";
import { invoiceInclude, serializeAgreement, serializeInvoice } from "@/lib/selfBilling/serialize";
import { formatDateOnly, issueDeadline } from "@/lib/selfBilling/workingDays";
import { monthLabel } from "@/lib/selfBilling/lines";

// Admin-only (proxy.ts guards /api/admin/*).

export async function GET() {
  const now = new Date();
  const [invoices, agreements, bankChanges] = await Promise.all([
    db.selfBilledInvoice.findMany({
      where: { OR: [{ status: { not: "VOID" } }, { voidedAt: { gte: new Date(now.getTime() - 90 * 86400000) } }] },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "asc" }],
      include: invoiceInclude,
    }),
    db.selfBillingAgreement.findMany({
      orderBy: { startDate: "desc" },
      include: { user: { select: { id: true, name: true, email: true, staffDetails: true } } },
    }),
    db.staffBankDetails.findMany({ where: { lastChangedAt: { not: null } }, select: { userId: true, lastChangedAt: true } }),
  ]);

  const lastPaidByUser = new Map<string, Date>();
  for (const i of invoices) if (i.paidAt && i.userId && (!lastPaidByUser.get(i.userId) || i.paidAt > lastPaidByUser.get(i.userId)!)) lastPaidByUser.set(i.userId, i.paidAt);
  // Same rule as the upload invoice check: bank details changed since their last payment.
  const bankChangedUserIds = bankChanges.filter((b) => !lastPaidByUser.get(b.userId) || b.lastChangedAt! > lastPaidByUser.get(b.userId)!).map((b) => b.userId);

  const prev = previousMonth(now);
  const serialAgreements = agreements.map((a) => ({
    ...serializeAgreement(a, now),
    user: a.user ? { id: a.user.id, name: a.user.name ?? a.user.email, email: a.user.email } : null,
  }));
  // HMRC: keep a list of VAT-registered self-billees with names, addresses, VAT numbers and agreement dates.
  const vatList = agreements
    .filter((a) => a.user?.staffDetails?.vatRegistered)
    .map((a) => ({
      agreementId: a.id,
      name: a.user!.staffDetails!.legalName ?? a.user!.name ?? a.user!.email,
      address: [a.user!.staffDetails!.addressLine1, a.user!.staffDetails!.addressLine2, a.user!.staffDetails!.city, a.user!.staffDetails!.postcode].filter(Boolean).join(", "),
      vatNumber: a.user!.staffDetails!.vatNumber,
      startDate: a.startDate.toISOString().slice(0, 10),
      endDate: a.endDate.toISOString().slice(0, 10),
    }));

  return NextResponse.json(
    {
      previousPeriod: { ...prev, label: monthLabel(prev.year, prev.month), issueDeadline: formatDateOnly(issueDeadline(prev.year, prev.month)) },
      invoices: invoices.map((i) => serializeInvoice(i, now)),
      agreements: serialAgreements,
      vatList,
      bankChangedUserIds,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** { action: "generate", year, month } or { action: "issue-all", ids } */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; year?: number; month?: number; ids?: string[] };

  if (body.action === "generate") {
    const y = Number(body.year);
    const m = Number(body.month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return NextResponse.json({ error: "Pick a month" }, { status: 400 });
    const now = new Date();
    if (Date.UTC(y, m, 1) > now.getTime()) return NextResponse.json({ error: "That month hasn't finished yet" }, { status: 400 });
    return NextResponse.json(await generateDrafts(y, m));
  }

  if (body.action === "issue-all" && Array.isArray(body.ids)) {
    const issued: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of body.ids) {
      try {
        await issueInvoice(String(id), session.sub);
        issued.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof SelfBillingError ? err.message : "Unexpected error" });
        if (!(err instanceof SelfBillingError)) console.error("[self-billing] issue failed", id, err);
      }
    }
    return NextResponse.json({ issued, failed });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
