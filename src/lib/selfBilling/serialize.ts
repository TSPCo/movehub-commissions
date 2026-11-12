import "server-only";
import type { Prisma } from "@/generated/prisma";
import { formatDateOnly, iso, issueDeadline, paymentDue, queryDeadline, londonDate, compareDates } from "./workingDays";
import { monthLabel } from "./lines";

export const invoiceInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  user: { select: { id: true, name: true, email: true } },
  original: { select: { number: true } },
  replaces: { select: { number: true } },
  replacedBy: { select: { id: true, number: true, status: true } },
} satisfies Prisma.SelfBilledInvoiceInclude;

type InvoiceRow = Prisma.SelfBilledInvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function serializeInvoice(i: InvoiceRow, now = new Date()) {
  const deadline = issueDeadline(i.periodYear, i.periodMonth);
  const issuedOn = i.issuedAt ? londonDate(i.issuedAt) : null;
  return {
    id: i.id,
    kind: i.kind,
    status: i.status,
    number: i.number,
    period: monthLabel(i.periodYear, i.periodMonth),
    periodYear: i.periodYear,
    periodMonth: i.periodMonth,
    user: i.user ? { id: i.user.id, name: i.user.name ?? i.user.email, email: i.user.email } : null,
    netPence: i.netPence,
    vatPence: i.vatPence,
    grossPence: i.grossPence,
    vatRatePercent: i.vatRatePercent,
    warnings: (i.warnings as string[] | null) ?? [],
    lines: i.lines.map((l) => ({
      id: l.id,
      type: l.type,
      description: l.description,
      amountPence: l.amountPence,
      completionDate: l.completionDate?.toISOString() ?? null,
    })),
    issueDeadline: formatDateOnly(deadline),
    // Issued late, or still a draft past the deadline. Only the month's original
    // invoice has a deadline — credit notes and reissues come later by nature.
    issueLate:
      i.kind === "INVOICE" && !i.replacesInvoiceId
        ? issuedOn
          ? compareDates(issuedOn, deadline) > 0
          : i.status === "DRAFT" && compareDates(londonDate(now), deadline) > 0
        : false,
    issuedAt: i.issuedAt?.toISOString() ?? null,
    queryBy: i.acceptanceClockFrom && (i.status === "ISSUED" || i.status === "QUERIED") ? formatDateOnly(queryDeadline(i.acceptanceClockFrom)) : null,
    queriedAt: i.queriedAt?.toISOString() ?? null,
    queryNote: i.queryNote,
    queryResponse: i.queryResponse,
    acceptedAt: i.acceptedAt?.toISOString() ?? null,
    acceptedHow: i.acceptedHow,
    paymentDue: i.acceptedAt ? formatDateOnly(paymentDue(i.acceptedAt)) : null,
    paymentOverdue: i.status === "ACCEPTED" && i.acceptedAt ? compareDates(londonDate(now), paymentDue(i.acceptedAt)) > 0 : false,
    paymentDueIso: i.acceptedAt ? iso(paymentDue(i.acceptedAt)) : null,
    paidAt: i.paidAt?.toISOString() ?? null,
    voidReason: i.voidReason,
    originalNumber: i.original?.number ?? null,
    replacesNumber: i.replaces?.number ?? null,
    replacedBy: i.replacedBy.filter((r) => r.status !== "VOID").map((r) => ({ id: r.id, number: r.number })),
    hasPdf: i.status !== "DRAFT" && i.status !== "VOID" ? true : i.status === "VOID" && Boolean(i.number),
  };
}

export type SerializedInvoice = ReturnType<typeof serializeInvoice>;

export const serializeAgreement = (a: { id: string; startDate: Date; endDate: Date; version: string; signedName: string; signedAt: Date; endedAt: Date | null; endReason: string | null; agreementText: string; moveHubSignatory: string }, now = new Date()) => ({
  id: a.id,
  startDate: a.startDate.toISOString().slice(0, 10),
  endDate: a.endDate.toISOString().slice(0, 10),
  version: a.version,
  signedName: a.signedName,
  signedAt: a.signedAt.toISOString(),
  moveHubSignatory: a.moveHubSignatory,
  endedAt: a.endedAt?.toISOString() ?? null,
  endReason: a.endReason,
  text: a.agreementText,
  state: a.endDate.getTime() + 86400000 <= now.getTime() || a.endDate < a.startDate ? "ended" : a.startDate > now ? "upcoming" : "active",
});
