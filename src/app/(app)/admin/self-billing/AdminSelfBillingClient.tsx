"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { formatPence } from "@/lib/money";
import { type Agreement, type Invoice, LinesTable, StatusPill, fmtDay } from "@/components/selfBilling/shared";

type Data = {
  previousPeriod: { year: number; month: number; label: string; issueDeadline: string };
  invoices: Invoice[];
  agreements: (Agreement & { user: { id: string; name: string; email: string } | null })[];
  vatList: { agreementId: string; name: string; address: string; vatNumber: string | null; startDate: string; endDate: string }[];
  bankChangedUserIds: string[];
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

const Section = ({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-3">
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {hint && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
    {children}
  </section>
);

export function AdminSelfBillingClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [genMonth, setGenMonth] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/self-billing", { cache: "no-store" });
    const body = await res.json();
    if (res.ok) setData(body);
    else setError(body.error || "Couldn't load");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/self-billing", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) {
          setData(body);
          setGenMonth(`${body.previousPeriod.year}-${String(body.previousPeriod.month).padStart(2, "0")}`);
        } else setError(body.error || "Couldn't load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const act = (id: string, action: string, extra: Record<string, unknown> = {}) => run(`${id}:${action}`, async () => {
    await post(`/api/admin/self-billing/invoices/${id}`, { action, ...extra });
  });

  if (!data) return <div className="card p-5 text-sm" style={{ color: "var(--text-muted)" }}>{error ?? "Loading…"}</div>;

  const drafts = data.invoices.filter((i) => i.status === "DRAFT");
  const queried = data.invoices.filter((i) => i.status === "QUERIED");
  const awaiting = data.invoices.filter((i) => i.status === "ISSUED");
  const history = data.invoices.filter((i) => ["ACCEPTED", "PAID", "VOID"].includes(i.status) && (i.status !== "VOID" || i.number));
  const issuable = drafts.filter((d) => !d.warnings.some((w) => w.includes("incomplete")));

  return (
    <div className="space-y-8">
      <div className="card p-4 flex flex-wrap items-end justify-between gap-3 text-sm">
        <p style={{ color: "var(--text-secondary)" }}>
          Drafts for <strong className="text-white">{data.previousPeriod.label}</strong> are made automatically each morning from the 1st. The agreement says they go out by{" "}
          <strong className="text-white">{data.previousPeriod.issueDeadline}</strong>.
        </p>
        <div className="flex items-end gap-2">
          <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="px-3 py-1.5 text-xs" />
          <button
            disabled={!!busy || !genMonth}
            onClick={() =>
              run("generate", async () => {
                const [y, m] = genMonth.split("-").map(Number);
                const r = await post("/api/admin/self-billing", { action: "generate", year: y, month: m });
                const skipped = r.skipped.length ? ` ${r.skipped.length} skipped (${r.skipped.map((s: { name: string; reason: string }) => `${s.name}: ${s.reason}`).join("; ")}).` : "";
                return `Created ${r.created.length} draft${r.created.length === 1 ? "" : "s"}.${skipped}${r.unmatchedCompletions ? ` ${r.unmatchedCompletions} unmatched completion(s) that month.` : ""}`;
              })
            }
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {busy === "generate" ? "Generating…" : "Generate drafts now"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {notice && <p className="text-sm" style={{ color: "var(--success)" }}>{notice}</p>}

      <Section
        title={`Drafts to review (${drafts.length})`}
        hint="Nothing is sent until you issue it. Issuing assigns the number, freezes the progressor's details, makes the PDF and emails it to them."
      >
        {drafts.length > 1 && issuable.length > 0 && (
          <button
            disabled={!!busy}
            onClick={() =>
              confirm(`Issue and email ${issuable.length} invoice${issuable.length === 1 ? "" : "s"}?`) &&
              run("issue-all", async () => {
                const r = await post("/api/admin/self-billing", { action: "issue-all", ids: issuable.map((d) => d.id) });
                return `Issued ${r.issued.length}.${r.failed.length ? ` Not issued: ${r.failed.map((f: { error: string }) => f.error).join("; ")}` : ""}`;
              })
            }
            className="btn-primary px-4 py-2 text-sm"
          >
            {busy === "issue-all" ? "Issuing…" : `Issue all ${issuable.length} ready drafts`}
          </button>
        )}
        {drafts.length === 0 && <Empty>No drafts waiting.</Empty>}
        {drafts.map((d) => <DraftCard key={d.id} inv={d} busy={busy} act={act} />)}
      </Section>

      <Section title={`Queried (${queried.length})`} hint="Confirm it unchanged with a reply, or reissue it — reissuing voids this one (its number stays on record) and makes a fresh draft from current data.">
        {queried.length === 0 && <Empty>No open queries.</Empty>}
        {queried.map((q) => <QueriedCard key={q.id} inv={q} busy={busy} act={act} />)}
      </Section>

      <Section title={`Awaiting acceptance (${awaiting.length})`} hint="Accepted automatically if there's no query by the date shown (5 working days).">
        {awaiting.length === 0 ? <Empty>Nothing waiting.</Empty> : (
          <Table
            head={["Invoice", "Progressor", "Period", "Total", "Issued", "Query by", ""]}
            rows={awaiting.map((i) => [
              <span key="n" className="font-medium text-white">{i.number}</span>,
              i.user?.name ?? "—",
              i.period,
              formatPence(i.grossPence),
              <span key="iss" style={{ color: i.issueLate ? "var(--warning)" : undefined }}>{new Date(i.issuedAt!).toLocaleDateString("en-GB")}{i.issueLate ? " (late)" : ""}</span>,
              i.queryBy,
              <PdfLink key="p" id={i.id} />,
            ])}
          />
        )}
      </Section>

      <Section title="Issued history" hint="Accepted invoices are paid from the Payments page. Correct an accepted invoice with a credit note — it's never edited.">
        {history.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <div className="space-y-2">
            {history.map((i) => <HistoryRow key={i.id} inv={i} busy={busy} act={act} />)}
          </div>
        )}
      </Section>

      <Section title={`Agreements (${data.agreements.length})`}>
        {data.agreements.length === 0 ? <Empty>No one has signed yet. Progressors sign from their Self-billing page once their invoice details are complete.</Empty> : (
          <div className="space-y-2">
            {data.agreements.map((a) => <AgreementRow key={a.id} a={a} busy={busy} run={run} />)}
          </div>
        )}
      </Section>

      <Section title="VAT-registered self-billees" hint="HMRC requires this list (VAT Notice 700/62).">
        {data.vatList.length === 0 ? <Empty>None.</Empty> : (
          <Table
            head={["Name", "Address", "VAT number", "Agreement"]}
            rows={data.vatList.map((v) => [v.name, v.address, v.vatNumber ?? "—", `${fmtDay(v.startDate)} – ${fmtDay(v.endDate)}`])}
          />
        )}
      </Section>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="card p-4 text-sm" style={{ color: "var(--text-muted)" }}>{children}</div>;

const PdfLink = ({ id, label = "PDF" }: { id: string; label?: string }) => (
  <a href={`/api/admin/self-billing/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--cyan)" }}>
    <FileText className="h-3.5 w-3.5" /> {label}
  </a>
);

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {head.map((h, i) => <th key={i} className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              {r.map((c, j) => <td key={j} className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Act = (id: string, action: string, extra?: Record<string, unknown>) => Promise<void>;

function DraftCard({ inv, busy, act }: { inv: Invoice; busy: string | null; act: Act }) {
  const [adjDesc, setAdjDesc] = useState("");
  const [adjAmt, setAdjAmt] = useState("");
  const blocked = inv.warnings.some((w) => w.includes("incomplete"));
  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold text-white">{inv.user?.name ?? "Removed user"}</span>
          <span style={{ color: "var(--text-muted)" }}> · {inv.period}{inv.replacesNumber ? ` · replaces ${inv.replacesNumber}` : ""}</span>
          {inv.issueLate && <span className="ml-2 text-xs" style={{ color: "var(--warning)" }}>Past the {inv.issueDeadline} issue deadline</span>}
        </div>
        <div className="flex items-center gap-3">
          {!blocked && <PdfLink id={inv.id} label="Preview" />}
          <button disabled={!!busy || blocked} onClick={() => act(inv.id, "issue")} className="btn-primary px-4 py-1.5 text-sm">
            {busy === `${inv.id}:issue` ? "Issuing…" : "Issue"}
          </button>
        </div>
      </div>
      {inv.warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--warning)" }}><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}</p>
      ))}
      <LinesTable inv={inv} onRemoveAdjustment={(lineId) => act(inv.id, "remove-adjustment", { lineId })} />
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <input value={adjDesc} onChange={(e) => setAdjDesc(e.target.value)} placeholder="Adjustment, e.g. missed completion 3 Oak Rd" className="flex-1 min-w-56 px-3 py-1.5 text-xs" />
        <input value={adjAmt} onChange={(e) => setAdjAmt(e.target.value)} placeholder="£ (− to deduct)" type="number" step="0.01" className="w-32 px-3 py-1.5 text-xs" />
        <button
          disabled={!!busy || !adjDesc.trim() || !adjAmt}
          onClick={() => act(inv.id, "adjust", { text: adjDesc, amountPence: Math.round(Number(adjAmt) * 100) }).then(() => { setAdjDesc(""); setAdjAmt(""); })}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Add line
        </button>
        <button disabled={!!busy} onClick={() => act(inv.id, "regenerate")} className="btn-secondary px-3 py-1.5 text-xs" title="Rebuild from current data, e.g. after fixing a fee earner name">Regenerate</button>
        <button disabled={!!busy} onClick={() => confirm("Discard this draft? Its completions and bonuses go back to unbilled and roll onto the next invoice.") && act(inv.id, "void")} className="btn-secondary px-3 py-1.5 text-xs" style={{ color: "var(--danger)" }}>Discard</button>
      </div>
    </div>
  );
}

function QueriedCard({ inv, busy, act }: { inv: Invoice; busy: string | null; act: Act }) {
  const [reply, setReply] = useState("");
  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div><span className="font-semibold text-white">{inv.number}</span><span style={{ color: "var(--text-muted)" }}> · {inv.user?.name} · {inv.period} · {formatPence(inv.grossPence)}</span></div>
        <PdfLink id={inv.id} />
      </div>
      <blockquote className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(245,158,11,0.08)", borderLeft: "3px solid var(--warning)", color: "var(--text-secondary)" }}>
        {inv.queryNote}
        <span className="block text-xs mt-1" style={{ color: "var(--text-muted)" }}>Queried {new Date(inv.queriedAt!).toLocaleString("en-GB")}</span>
      </blockquote>
      <details className="text-xs"><summary className="cursor-pointer" style={{ color: "var(--text-muted)" }}>Lines</summary><div className="mt-2"><LinesTable inv={inv} /></div></details>
      <div className="flex flex-wrap items-end gap-2">
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply if it stands, e.g. 12 Elm St completed 2 Dec, checked in InTouch" className="flex-1 min-w-64 px-3 py-1.5 text-xs" />
        <button disabled={!!busy || !reply.trim()} onClick={() => act(inv.id, "confirm", { text: reply })} className="btn-secondary px-3 py-1.5 text-xs">Confirm unchanged</button>
        <button disabled={!!busy} onClick={() => confirm(`Void ${inv.number} and make a fresh draft from current data? Fix the underlying data (e.g. fee earner name) first, or add adjustment lines to the new draft.`) && act(inv.id, "reissue", { text: `Reissued after query: ${inv.queryNote?.slice(0, 200)}` })} className="btn-primary px-3 py-1.5 text-xs">Reissue</button>
      </div>
    </div>
  );
}

function HistoryRow({ inv, busy, act }: { inv: Invoice; busy: string | null; act: Act }) {
  const [crediting, setCrediting] = useState(false);
  const [amt, setAmt] = useState("");
  const [why, setWhy] = useState("");
  return (
    <div className="card px-4 py-3 text-sm space-y-2" style={inv.status === "VOID" ? { opacity: 0.6 } : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-white">{inv.kind === "CREDIT_NOTE" ? "Credit note " : ""}{inv.number}</span>
        <span style={{ color: "var(--text-muted)" }}>{inv.user?.name} · {inv.period}{inv.originalNumber ? ` · against ${inv.originalNumber}` : ""}</span>
        <StatusPill inv={inv} />
        <span className="ml-auto font-medium">{formatPence(inv.grossPence)}</span>
        <PdfLink id={inv.id} />
        {inv.kind === "INVOICE" && (inv.status === "ACCEPTED" || inv.status === "PAID") && (
          <button onClick={() => setCrediting((c) => !c)} className="text-xs" style={{ color: "var(--text-muted)" }}>Credit note…</button>
        )}
      </div>
      {inv.status === "VOID" && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{inv.voidReason}</p>}
      {crediting && (
        <div className="flex flex-wrap items-end gap-2">
          <input value={amt} onChange={(e) => setAmt(e.target.value)} type="number" step="0.01" min="0.01" placeholder="Net £ to credit" className="w-32 px-3 py-1.5 text-xs" />
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason (printed on the credit note)" className="flex-1 min-w-64 px-3 py-1.5 text-xs" />
          <button
            disabled={!!busy || !amt || !why.trim()}
            onClick={() => confirm(`Issue and email a credit note of ${formatPence(Math.round(Number(amt) * 100))} (plus VAT if they're registered) against ${inv.number}?`) && act(inv.id, "credit-note", { amountPence: Math.round(Number(amt) * 100), text: why }).then(() => setCrediting(false))}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Issue credit note
          </button>
        </div>
      )}
    </div>
  );
}

function AgreementRow({ a, busy, run }: { a: Data["agreements"][number]; busy: string | null; run: (key: string, fn: () => Promise<string | void>) => Promise<void> }) {
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const color = a.state === "active" ? "var(--success)" : a.state === "upcoming" ? "var(--cyan)" : "var(--text-muted)";
  return (
    <div className="card px-4 py-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-white">{a.user?.name ?? "Removed user"}</span>
        <span style={{ color: "var(--text-muted)" }}>{fmtDay(a.startDate)} – {fmtDay(a.endDate)}</span>
        <span className="text-xs font-medium" style={{ color }}>{a.state === "active" ? "In force" : a.state === "upcoming" ? "Starts soon" : "Ended"}{a.endedAt && a.state !== "ended" ? " · notice given" : ""}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Signed &ldquo;{a.signedName}&rdquo; {new Date(a.signedAt).toLocaleDateString("en-GB")} · v{a.version}</span>
        <span className="ml-auto flex gap-3 text-xs">
          <details>
            <summary className="cursor-pointer" style={{ color: "var(--cyan)" }}>Text</summary>
            <pre className="absolute z-10 mt-2 max-h-96 w-[36rem] max-w-[80vw] overflow-y-auto whitespace-pre-wrap rounded-lg p-3 font-sans text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{a.text}</pre>
          </details>
          {!a.endedAt && a.state !== "ended" && <button onClick={() => setEnding((e) => !e)} style={{ color: "var(--danger)" }}>End…</button>}
        </span>
      </div>
      {a.endReason && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Ended: {a.endReason}</p>}
      {ending && (
        <div className="flex flex-wrap items-end gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="flex-1 min-w-64 px-3 py-1.5 text-xs" />
          <button
            disabled={!!busy || !reason.trim()}
            onClick={() => run(`end:${a.id}`, async () => {
              await post(`/api/admin/self-billing/agreements/${a.id}`, { reason });
              return "Agreement ended — self-billing stops at the end of the month the 14 days' notice runs out in.";
            })}
            className="btn-secondary px-3 py-1.5 text-xs"
            style={{ color: "var(--danger)" }}
          >
            End with 14 days&apos; notice
          </button>
        </div>
      )}
    </div>
  );
}
