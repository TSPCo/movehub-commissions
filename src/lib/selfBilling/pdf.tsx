import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatPence } from "@/lib/money";
import { monthLabel } from "./lines";
import type { Supplier } from "./agreementText";
import { MOVE_HUB, supplierAddress } from "./agreementText";

// Clean white document, navy text — Move Hub brand guide §3.5/§7 (documents
// aren't gradient-branded).
const NAVY = "#0A0F1D";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

const s = StyleSheet.create({
  page: { padding: 44, fontSize: 9.5, fontFamily: "Helvetica", color: TEXT, lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: NAVY },
  badge: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY, borderWidth: 1, borderColor: NAVY, paddingVertical: 3, paddingHorizontal: 6, marginTop: 6, alignSelf: "flex-start" },
  meta: { textAlign: "right" },
  metaLabel: { color: MUTED },
  parties: { flexDirection: "row", gap: 24, marginBottom: 20 },
  party: { flex: 1 },
  h: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  strong: { fontFamily: "Helvetica-Bold", color: NAVY },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 5 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 4 },
  cDesc: { flex: 1, paddingRight: 8 },
  cDate: { width: 70 },
  cAmt: { width: 70, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: NAVY, marginTop: 4, paddingTop: 4, fontFamily: "Helvetica-Bold", color: NAVY },
  note: { marginTop: 18, color: TEXT },
  footer: { position: "absolute", bottom: 30, left: 44, right: 44, fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 },
});

export type PdfInvoice = {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issuedAt: Date;
  periodYear: number;
  periodMonth: number;
  supplier: Supplier;
  lines: { description: string; completionDate: Date | null; amountPence: number }[];
  netPence: number;
  vatPence: number;
  grossPence: number;
  vatRatePercent: number | null;
  originalNumber?: string | null;
  agreement: { startDate: Date; endDate: Date } | null;
};

const d = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
const dUtc = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

function InvoiceDoc({ inv }: { inv: PdfInvoice }) {
  const credit = inv.kind === "CREDIT_NOTE";
  const sup = inv.supplier;
  return (
    <Document title={`${credit ? "Credit note" : "Invoice"} ${inv.number}`} author={MOVE_HUB.legalName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>{credit ? "Credit note" : "Invoice"}</Text>
            <Text style={s.badge}>SELF-BILLING</Text>
          </View>
          <View style={s.meta}>
            <Text><Text style={s.metaLabel}>Number </Text><Text style={s.strong}>{inv.number}</Text></Text>
            <Text><Text style={s.metaLabel}>Date / tax point </Text>{d(inv.issuedAt)}</Text>
            <Text><Text style={s.metaLabel}>Period </Text>{monthLabel(inv.periodYear, inv.periodMonth)}</Text>
            {credit && inv.originalNumber ? <Text><Text style={s.metaLabel}>Against invoice </Text>{inv.originalNumber}</Text> : null}
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.h}>Supplier</Text>
            <Text style={s.strong}>{sup.legalName}</Text>
            {[sup.addressLine1, sup.addressLine2, sup.city, sup.postcode].filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
            <Text style={{ marginTop: 4 }}>{sup.vatRegistered && sup.vatNumber ? `VAT number ${sup.vatNumber}` : "Supplier not registered for VAT"}</Text>
          </View>
          <View style={s.party}>
            <Text style={s.h}>Customer (self-biller)</Text>
            <Text style={s.strong}>{MOVE_HUB.legalName} t/a {MOVE_HUB.tradingName}</Text>
            {MOVE_HUB.address.map((l, i) => <Text key={i}>{l}</Text>)}
            <Text style={{ marginTop: 4 }}>Company number {MOVE_HUB.companyNumber} · VAT number {MOVE_HUB.vatNumber}</Text>
          </View>
        </View>

        <View style={s.headRow}>
          <Text style={[s.cDesc, s.h]}>Description</Text>
          <Text style={[s.cDate, s.h]}>Completed</Text>
          <Text style={[s.cAmt, s.h]}>Amount</Text>
        </View>
        {inv.lines.map((l, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cDate}>{l.completionDate ? dUtc(l.completionDate) : ""}</Text>
            <Text style={s.cAmt}>{formatPence(l.amountPence)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}><Text>Net</Text><Text>{formatPence(inv.netPence)}</Text></View>
          {inv.vatRatePercent != null ? (
            <View style={s.totalRow}><Text>VAT at {inv.vatRatePercent}%</Text><Text>{formatPence(inv.vatPence)}</Text></View>
          ) : null}
          <View style={s.grand}><Text>{credit ? "Total credited" : "Total due"}</Text><Text>{formatPence(inv.grossPence)}</Text></View>
        </View>

        <View style={s.note} wrap={false}>
          {inv.vatRatePercent != null ? (
            <Text style={s.strong}>The VAT shown is your output tax due to HMRC.</Text>
          ) : (
            <Text>Supplier not registered for VAT — no VAT is charged.</Text>
          )}
          {!credit ? <Text style={{ marginTop: 6 }}>Payable within 10 days of acceptance to the bank account the supplier has given Move Hub.</Text> : null}
        </View>

        <Text style={s.footer} fixed>
          Raised by {MOVE_HUB.legalName} on behalf of {sup.legalName} ({supplierAddress(sup)}) under a self-billing agreement
          {inv.agreement ? ` running ${dUtc(inv.agreement.startDate)} to ${dUtc(inv.agreement.endDate)}` : ""}. The supplier will not issue their own invoice for these services.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(inv: PdfInvoice): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc inv={inv} />);
}
