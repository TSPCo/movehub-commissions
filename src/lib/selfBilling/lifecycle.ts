import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatPence } from "@/lib/money";
import { missingInvoiceFields } from "@/lib/staffDetails";
import {
  selfBilledDeemedEmail,
  selfBilledIssuedEmail,
  selfBilledQueriedEmail,
  selfBilledQueryAnsweredEmail,
} from "@/lib/emailTemplates";
import { MOVE_HUB, type Supplier } from "./agreementText";
import { monthLabel, totals } from "./lines";
import { renderInvoicePdf } from "./pdf";
import { formatDateOnly, isDeemedAccepted, paymentDue, queryDeadline } from "./workingDays";
import { generateDrafts } from "./generate";

export class SelfBillingError extends Error {}

export const appUrl = () => (process.env.APP_URL?.trim() || "https://commissions.move-hub.co.uk").replace(/\/+$/, "");

async function adminEmails() {
  const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
  return admins.map((a) => a.email);
}

function supplierFrom(d: { legalName: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; postcode: string | null; vatRegistered: boolean; vatNumber: string | null }): Supplier {
  return {
    legalName: d.legalName!,
    addressLine1: d.addressLine1!,
    addressLine2: d.addressLine2,
    city: d.city!,
    postcode: d.postcode!,
    vatRegistered: d.vatRegistered,
    vatNumber: d.vatRegistered ? d.vatNumber : null,
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "")[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 3) || "X";

async function load(id: string) {
  const inv = await db.selfBilledInvoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      user: { select: { id: true, name: true, email: true, staffDetails: true } },
      agreement: { select: { startDate: true, endDate: true } },
      original: { select: { number: true } },
    },
  });
  if (!inv) throw new SelfBillingError("Invoice not found");
  return inv;
}

/** Assign the next number, freeze supplier/customer details, render the PDF and email it. */
export async function issueInvoice(id: string, adminId: string) {
  const inv = await load(id);
  if (inv.status !== "DRAFT") throw new SelfBillingError("Only drafts can be issued");
  if (!inv.user) throw new SelfBillingError("This person's account no longer exists");
  const missing = missingInvoiceFields(inv.user.staffDetails);
  if (missing.length) throw new SelfBillingError(`${inv.user.name ?? inv.user.email}'s invoice details are incomplete: ${missing.join(", ")}`);
  if (inv.lines.length === 0) throw new SelfBillingError("This invoice has no lines");

  const supplier = supplierFrom(inv.user.staffDetails!);
  // VAT status is taken as it stands at issue, in case it changed since the draft was made.
  const t = totals(inv.lines.map((l) => l.amountPence), supplier.vatRegistered);
  const now = new Date();

  const issued = await db.$transaction(async (tx) => {
    const last = await tx.selfBilledInvoice.aggregate({ where: { userId: inv.userId }, _max: { sequence: true } });
    const sequence = (last._max.sequence ?? 0) + 1;
    const number = `SB-${initials(supplier.legalName)}-${String(sequence).padStart(4, "0")}`;
    const pdf = await renderInvoicePdf({
      kind: inv.kind,
      number,
      issuedAt: now,
      periodYear: inv.periodYear,
      periodMonth: inv.periodMonth,
      supplier,
      lines: inv.lines.map((l) => ({ description: l.description, completionDate: l.completionDate, amountPence: l.amountPence })),
      ...t,
      originalNumber: inv.original?.number,
      agreement: inv.agreement,
    });
    return tx.selfBilledInvoice.update({
      where: { id, status: "DRAFT" },
      data: {
        status: "ISSUED",
        sequence,
        number,
        ...t,
        issuedAt: now,
        issuedById: adminId,
        acceptanceClockFrom: now,
        supplierSnapshot: supplier,
        customerSnapshot: MOVE_HUB,
        pdfData: Uint8Array.from(pdf),
      },
    });
  });

  const email = selfBilledIssuedEmail({
    name: inv.user.name ?? inv.user.email,
    number: issued.number!,
    period: monthLabel(inv.periodYear, inv.periodMonth),
    total: formatPence(issued.grossPence),
    queryBy: formatDateOnly(queryDeadline(now)),
    url: `${appUrl()}/self-billing`,
    creditNote: inv.kind === "CREDIT_NOTE",
    reissue: Boolean(inv.replacesInvoiceId),
  });
  await sendEmail({ to: inv.user.email, ...email, attachments: [{ filename: `${issued.number}.pdf`, content: Buffer.from(issued.pdfData!) }] });
  return issued;
}

export async function acceptInvoice(id: string, userId: string) {
  const r = await db.selfBilledInvoice.updateMany({
    where: { id, userId, status: "ISSUED" },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedHow: "CONFIRMED" },
  });
  if (r.count !== 1) throw new SelfBillingError("This invoice can't be accepted now");
}

export async function queryInvoice(id: string, userId: string, note: string) {
  const text = note.trim().slice(0, 2000);
  if (!text) throw new SelfBillingError("Say what looks wrong so we can check it");
  const r = await db.selfBilledInvoice.updateMany({
    where: { id, userId, status: "ISSUED" },
    data: { status: "QUERIED", queriedAt: new Date(), queryNote: text },
  });
  if (r.count !== 1) throw new SelfBillingError("This invoice can't be queried now");
  const inv = await load(id);
  const to = await adminEmails();
  const email = selfBilledQueriedEmail({ progressor: inv.user?.name ?? inv.user?.email ?? "A progressor", number: inv.number!, note: text, url: `${appUrl()}/admin/self-billing` });
  await Promise.all(to.map((a) => sendEmail({ to: a, ...email })));
}

/** Admin checked a query and the invoice stands: back to ISSUED, acceptance clock restarts. */
export async function confirmQueried(id: string, response: string) {
  const text = response.trim().slice(0, 2000);
  if (!text) throw new SelfBillingError("Add a short reply explaining why it stands");
  const now = new Date();
  const r = await db.selfBilledInvoice.updateMany({
    where: { id, status: "QUERIED" },
    data: { status: "ISSUED", queryResponse: text, acceptanceClockFrom: now },
  });
  if (r.count !== 1) throw new SelfBillingError("Only queried invoices can be confirmed");
  const inv = await load(id);
  if (inv.user) {
    await sendEmail({
      to: inv.user.email,
      ...selfBilledQueryAnsweredEmail({ name: inv.user.name ?? inv.user.email, number: inv.number!, response: text, queryBy: formatDateOnly(queryDeadline(now)), url: `${appUrl()}/self-billing` }),
    });
  }
}

async function releaseItems(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], invoiceId: string) {
  const lineIds = (await tx.selfBilledInvoiceLine.findMany({ where: { invoiceId }, select: { id: true } })).map((l) => l.id);
  await tx.completedMatter.updateMany({ where: { selfBilledLineId: { in: lineIds } }, data: { selfBilledLineId: null } });
  await tx.bonusPayment.updateMany({ where: { selfBilledLineId: { in: lineIds } }, data: { selfBilledLineId: null } });
}

/**
 * Void a draft (discard) or a queried invoice (replace). Its completions and
 * bonuses are released and a fresh draft is generated from current data, so
 * fixes made since (e.g. a corrected fee earner name) are picked up. A voided
 * issued invoice keeps its number, marked as replaced.
 */
export async function voidAndRegenerate(id: string, reason: string, regenerate: boolean) {
  const inv = await load(id);
  if (inv.kind !== "INVOICE") throw new SelfBillingError("Credit notes can't be voided");
  if (inv.status !== "DRAFT" && inv.status !== "QUERIED") throw new SelfBillingError("Only drafts and queried invoices can be voided — accepted invoices are corrected with a credit note");
  await db.$transaction(async (tx) => {
    await releaseItems(tx, id);
    await tx.selfBilledInvoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim().slice(0, 500) || null } });
  });
  if (!regenerate || !inv.userId) return null;
  const summary = await generateDrafts(inv.periodYear, inv.periodMonth, inv.userId);
  const created = summary.created[0];
  if (created && inv.status === "QUERIED") {
    await db.selfBilledInvoice.update({ where: { id: created.invoiceId }, data: { replacesInvoiceId: id } });
  }
  return created ?? null;
}

/** Add a manual line (positive or negative) to a draft, e.g. a correction agreed with the progressor. */
export async function addAdjustment(id: string, description: string, amountPence: number) {
  const inv = await load(id);
  if (inv.status !== "DRAFT") throw new SelfBillingError("Lines can only be added to drafts");
  if (!description.trim() || !Number.isInteger(amountPence) || amountPence === 0) throw new SelfBillingError("Add a description and a non-zero amount");
  await db.selfBilledInvoiceLine.create({
    data: { invoiceId: id, type: "ADJUSTMENT", description: `Adjustment — ${description.trim().slice(0, 300)}`, amountPence, sortOrder: inv.lines.length },
  });
  const t = totals([...inv.lines.map((l) => l.amountPence), amountPence], Boolean(inv.user?.staffDetails?.vatRegistered));
  await db.selfBilledInvoice.update({ where: { id }, data: t });
}

export async function removeAdjustment(lineId: string) {
  const line = await db.selfBilledInvoiceLine.findUnique({ where: { id: lineId }, include: { invoice: { include: { lines: true, user: { select: { staffDetails: true } } } } } });
  if (!line || line.type !== "ADJUSTMENT" || line.invoice.status !== "DRAFT") throw new SelfBillingError("Only adjustment lines on drafts can be removed");
  await db.selfBilledInvoiceLine.delete({ where: { id: lineId } });
  const t = totals(line.invoice.lines.filter((l) => l.id !== lineId).map((l) => l.amountPence), Boolean(line.invoice.user?.staffDetails?.vatRegistered));
  await db.selfBilledInvoice.update({ where: { id: line.invoiceId }, data: t });
}

/** Correct an accepted invoice: a separate credit note referring to it, issued straight away. */
export async function createCreditNote(originalId: string, adminId: string, amountPence: number, reason: string) {
  const orig = await load(originalId);
  if (orig.kind !== "INVOICE" || (orig.status !== "ACCEPTED" && orig.status !== "PAID")) throw new SelfBillingError("Credit notes are raised against accepted or paid invoices");
  if (!Number.isInteger(amountPence) || amountPence <= 0 || amountPence > orig.netPence) throw new SelfBillingError("Amount must be more than £0 and no more than the original's net total");
  if (!reason.trim()) throw new SelfBillingError("Give a reason — it's printed on the credit note");
  const draft = await db.selfBilledInvoice.create({
    data: {
      userId: orig.userId,
      agreementId: orig.agreementId,
      kind: "CREDIT_NOTE",
      periodYear: orig.periodYear,
      periodMonth: orig.periodMonth,
      originalInvoiceId: orig.id,
      lines: { create: [{ type: "ADJUSTMENT", description: `Credit against ${orig.number} — ${reason.trim().slice(0, 300)}`, amountPence: -amountPence }] },
    },
  });
  return issueInvoice(draft.id, adminId);
}

export async function setPaid(id: string, paid: boolean) {
  // Credit notes are never "paid": they reduce what's owed as soon as they're issued.
  const r = await db.selfBilledInvoice.updateMany({
    where: { id, kind: "INVOICE", status: paid ? "ACCEPTED" : "PAID" },
    data: paid ? { status: "PAID", paidAt: new Date() } : { status: "ACCEPTED", paidAt: null },
  });
  if (r.count !== 1) throw new SelfBillingError(paid ? "Only accepted invoices can be marked paid" : "That invoice isn't marked paid");
}

/** Daily: ISSUED with no query after 5 working days → ACCEPTED (deemed), with an email. */
export async function applyDeemedAcceptance(now = new Date()) {
  const open = await db.selfBilledInvoice.findMany({
    where: { status: "ISSUED", acceptanceClockFrom: { not: null } },
    select: { id: true, acceptanceClockFrom: true },
  });
  const accepted: string[] = [];
  for (const o of open) {
    if (!isDeemedAccepted(o.acceptanceClockFrom!, now)) continue;
    const r = await db.selfBilledInvoice.updateMany({ where: { id: o.id, status: "ISSUED" }, data: { status: "ACCEPTED", acceptedAt: now, acceptedHow: "DEEMED" } });
    if (r.count !== 1) continue;
    accepted.push(o.id);
    const inv = await load(o.id);
    if (inv.user) {
      await sendEmail({
        to: inv.user.email,
        ...selfBilledDeemedEmail({ name: inv.user.name ?? inv.user.email, number: inv.number!, total: formatPence(inv.grossPence), payBy: formatDateOnly(paymentDue(now)) }),
      });
    }
  }
  return accepted;
}
