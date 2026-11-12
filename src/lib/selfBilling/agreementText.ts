// The self-billing agreement as shown and signed in the app. Wording follows the
// Claude Doc "Self-Billing Agreement – Move Hub Progressors", as reviewed and
// approved by Mat on 12 Nov 2026 (review copy: claude.ai/artifact/2LaY69mPVT74TAZkyjMEB3).
// Changing the wording? Bump AGREEMENT_VERSION — every signed agreement stores
// the exact text it was signed with, so old ones are unaffected.

import { londonDate, lastDayOfMonth, type DateOnly } from "./workingDays";

export const AGREEMENT_VERSION = "2026-11-v1";

export const MOVE_HUB = {
  legalName: "Move Holdings Ltd",
  tradingName: "Move Hub",
  companyNumber: "17223916",
  address: ["New Holme", "104 Church Road", "New Mills", "High Peak", "Derbyshire", "SK22 4PF"],
  vatNumber: "524 5077 01",
  signatoryName: "Ashley Roberts",
  signatoryPosition: "Founder",
} as const;

export type Supplier = {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  vatRegistered: boolean;
  vatNumber: string | null;
};

export const supplierAddress = (s: Supplier) => [s.addressLine1, s.addressLine2, s.city, s.postcode].filter(Boolean).join(", ");

const day = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/**
 * Launch: a progressor's FIRST agreement signed up to the end of this month
 * (UK time) starts on the 1st of the month it's signed in, so November 2026 is
 * the first self-billed month (invoiced on 1 December). After that the normal
 * rule applies. Remove once the rollout is over.
 */
export const ROLLOUT_CURRENT_MONTH_UNTIL = { y: 2026, m: 11 };

export const isRolloutMonth = (at: Date) => {
  const d = londonDate(at);
  return d.y * 12 + d.m <= ROLLOUT_CURRENT_MONTH_UNTIL.y * 12 + ROLLOUT_CURRENT_MONTH_UNTIL.m;
};

/**
 * Agreements run from the 1st of a month: signing on the 1st starts that month,
 * any other day starts the next — unless `startThisMonth` (the launch rule above).
 */
export function agreementPeriod(signedAt: Date, notBefore?: Date, startThisMonth = false): { startDate: Date; endDate: Date } {
  const today = londonDate(signedAt);
  let start: DateOnly =
    today.d === 1 || startThisMonth ? { y: today.y, m: today.m, d: 1 } : { y: today.m === 12 ? today.y + 1 : today.y, m: today.m === 12 ? 1 : today.m + 1, d: 1 };
  if (notBefore) {
    const nb = { y: notBefore.getUTCFullYear(), m: notBefore.getUTCMonth() + 1, d: 1 };
    if (nb.y * 12 + nb.m > start.y * 12 + start.m) start = nb;
  }
  const endMonthIndex = start.y * 12 + (start.m - 1) + 11;
  const end = lastDayOfMonth(Math.floor(endMonthIndex / 12), (endMonthIndex % 12) + 1);
  return { startDate: new Date(Date.UTC(start.y, start.m - 1, 1)), endDate: new Date(Date.UTC(end.y, end.m - 1, end.d)) };
}

export function renderAgreement(opts: { supplier: Supplier; startDate: Date; endDate: Date; ratePence: number }): string {
  const { supplier: s } = opts;
  const rate = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(opts.ratePence / 100);
  const vatLine = s.vatRegistered && s.vatNumber ? `VAT number ${s.vatNumber}.` : "Not VAT-registered.";

  return `MOVE HOLDINGS LTD SELF-BILLING AGREEMENT
Version ${AGREEMENT_VERSION}

1. PARTIES

The self-biller (customer): ${MOVE_HUB.legalName}, trading as ${MOVE_HUB.tradingName}. Company number ${MOVE_HUB.companyNumber}. Registered office: ${MOVE_HUB.address.join(", ")}. VAT number ${MOVE_HUB.vatNumber}. Referred to as "Move Hub".

The self-billee (supplier): ${s.legalName}, of ${supplierAddress(s)}. ${vatLine} Referred to as "the Progressor".

2. PURPOSE AND TERM

The Progressor provides sales progression services to Move Hub as a self-employed contractor. Move Hub will prepare and issue the invoices for those services on the Progressor's behalf, using the completion records held in the Move Hub commissions app.

This agreement covers all services the Progressor provides to Move Hub from ${day(opts.startDate)} to ${day(opts.endDate)}. Both parties will review it before the end date and may renew it by signing a new agreement.

3. MOVE HUB AGREES TO

1. Raise one self-billed invoice per calendar month covering all completions credited to the Progressor in that period, at the agreed rate of ${rate} per completion.
2. Mark every invoice "SELF-BILLING" and give it a unique number in a sequence kept for the Progressor.
3. Show on each invoice the Progressor's name and address, Move Hub's name and address, the invoice date, the period covered, each completion (property address and completion date), the rate, and the total due.
4. Send the Progressor a copy of each invoice through the commissions app and by email within 3 working days of the period end.
5. Pay accepted invoices within 10 days of acceptance to the bank account the Progressor has given.
6. Keep a copy of this agreement and each invoice for at least 6 years.

4. BONUSES AND REFERRAL FEES

Each self-billed invoice will also include any bonuses due to the Progressor for the period. Each bonus appears on its own line with a description and amount:
- Performance bonuses, calculated automatically by the commissions app under Move Hub's bonus scheme in force at the time.
- Referral fee bonuses, added to the commissions app by Move Hub before the period end.

A bonus confirmed after the invoice has been raised goes on the next period's invoice. Bonus lines follow the same acceptance and query process as the rest of the invoice (section 6).

5. THE PROGRESSOR AGREES TO

1. Accept invoices raised by Move Hub on their behalf for the services covered by this agreement.
2. Not issue their own invoices to Move Hub for those services while this agreement is in force.
3. Check each invoice and raise any query within the acceptance period in section 6.
4. Tell Move Hub straight away of any change to their name, address, bank details, VAT registration or self-employed status.
5. Remain responsible for their own Income Tax and National Insurance on payments received.

6. ACCEPTANCE, QUERIES AND CORRECTIONS

The Progressor accepts an invoice by confirming it in the commissions app. If they raise no query within 5 working days of it being sent, it is treated as accepted.

If the Progressor queries an invoice, Move Hub will check it and either confirm it or reissue it before it is accepted. Once an invoice is accepted, any correction is made by a separate credit note or additional invoice that refers to the original. An accepted invoice is never edited or replaced.

7. VAT (ONLY IF THE PROGRESSOR IS VAT-REGISTERED)

This section applies only while the Progressor is registered for VAT. Otherwise, invoices carry no VAT and state "Supplier not registered for VAT".

1. Each invoice will also show the Progressor's VAT number, the tax point, the VAT rate and the VAT amount, and will state: "The VAT shown is your output tax due to HMRC."
2. Move Hub will keep a list of VAT-registered self-billees, with names, addresses, VAT numbers and the dates of their agreements.
3. The Progressor will tell Move Hub straight away if they deregister, change VAT number, or transfer their business. Move Hub will then stop issuing VAT self-billed invoices until a new agreement is signed.
4. If Move Hub pays VAT the Progressor was not entitled to charge, the Progressor will repay it.

This section follows HMRC's Self-billing (VAT Notice 700/62).

8. ENDING THE AGREEMENT AND GENERAL TERMS

Either party may end this agreement by giving 14 days' written notice. Move Hub will still invoice and pay for all completions up to the end date. After that, the Progressor invoices Move Hub in the usual way.

This agreement covers invoicing only. It does not change the Progressor's self-employed status or any other terms between the parties. It is governed by the law of England and Wales.

Signed for ${MOVE_HUB.legalName} (${MOVE_HUB.tradingName}): ${MOVE_HUB.signatoryName}, ${MOVE_HUB.signatoryPosition}`;
}
