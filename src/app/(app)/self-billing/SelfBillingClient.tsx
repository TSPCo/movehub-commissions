"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText, ScrollText } from "lucide-react";
import { formatPence } from "@/lib/money";
import { type Agreement, type Invoice, LinesTable, StatusPill, fmtDay } from "@/components/selfBilling/shared";

type Data = {
  agreements: Agreement[];
  canSign: boolean;
  isRenewal: boolean;
  missing: string[];
  preview: { startDate: string; endDate: string; text: string } | null;
  invoices: Invoice[];
};

export function SelfBillingClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/my/self-billing", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) setError(body.error || "Couldn't load self-billing");
    else setData(body);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/my/self-billing", { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) setData(body);
        else setError(body.error || "Couldn't load self-billing");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return <div className="card p-5 text-sm" style={{ color: "var(--text-muted)" }}>{error ?? "Loading…"}</div>;

  const live = data.agreements.filter((a) => a.state !== "ended");

  return (
    <div className="space-y-6 max-w-4xl">
      {live.map((a) => <AgreementCard key={a.id} a={a} onChange={load} />)}
      {data.canSign && data.preview && <SignCard preview={data.preview} renewal={data.isRenewal} onSigned={load} />}
      {!data.canSign && live.length === 0 && (
        <div className="card p-5 text-sm space-y-2" style={{ color: "var(--text-secondary)" }}>
          <p>You don&apos;t have a self-billing agreement yet, so you upload your own invoices on My Commission.</p>
          {data.missing.length > 0 && (
            <p className="flex items-start gap-1.5" style={{ color: "var(--warning)" }}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                To sign one, first complete your <Link href="/details" className="underline">invoice details</Link> ({data.missing.join(", ")}).
              </span>
            </p>
          )}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white">Your self-billed invoices</h2>
        {data.invoices.length === 0 ? (
          <div className="card p-5 text-sm" style={{ color: "var(--text-muted)" }}>None yet. Your first arrives within 3 working days of the end of your first self-billing month.</div>
        ) : (
          <div className="space-y-3">
            {data.invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} onChange={load} />)}
          </div>
        )}
      </section>

      {data.agreements.some((a) => a.state === "ended") && (
        <details className="text-xs" style={{ color: "var(--text-muted)" }}>
          <summary className="cursor-pointer">Past agreements</summary>
          <ul className="mt-2 space-y-1">
            {data.agreements.filter((a) => a.state === "ended").map((a) => (
              <li key={a.id}>{fmtDay(a.startDate)} – {fmtDay(a.endDate)}{a.endReason ? ` (ended: ${a.endReason})` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AgreementCard({ a, onChange }: { a: Agreement; onChange: () => void }) {
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function end(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("End your self-billing agreement? Move Hub will still invoice everything up to the end date, then you go back to uploading your own invoices.")) return;
    const res = await fetch(`/api/my/self-billing/agreement/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error || "Something went wrong");
    onChange();
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ScrollText className="h-4 w-4" />
            {a.state === "active" ? "Self-billing agreement in force" : "Self-billing agreement signed — starts soon"}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {fmtDay(a.startDate)} to {fmtDay(a.endDate)}. Signed by you as &ldquo;{a.signedName}&rdquo; on {new Date(a.signedAt).toLocaleString("en-GB")}; for Move Hub by {a.moveHubSignatory}.
          </p>
          {a.endedAt && <p className="mt-1 text-xs" style={{ color: "var(--warning)" }}>Notice given — self-billing stops after {fmtDay(a.endDate)}.</p>}
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer" style={{ color: "var(--cyan)" }}>Read the agreement</summary>
        <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 font-sans" style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)" }}>{a.text}</pre>
      </details>
      {!a.endedAt && (
        ending ? (
          <form onSubmit={end} className="flex flex-wrap items-end gap-2">
            <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you ending it?" className="flex-1 min-w-60 px-3 py-2 text-sm" />
            <button className="btn-secondary px-3 py-2 text-xs" style={{ color: "var(--danger)" }}>Give 14 days&apos; notice</button>
            <button type="button" onClick={() => setEnding(false)} className="btn-secondary px-3 py-2 text-xs">Cancel</button>
            {error && <p className="w-full text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
          </form>
        ) : (
          <button onClick={() => setEnding(true)} className="text-xs" style={{ color: "var(--text-muted)" }}>End this agreement…</button>
        )
      )}
    </div>
  );
}

function SignCard({ preview, renewal, onSigned }: { preview: NonNullable<Data["preview"]>; renewal: boolean; onSigned: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/my/self-billing/agreement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signedName: name, agreed }) });
      const body = await res.json();
      if (!res.ok) return setError(body.error || "Something went wrong");
      onSigned();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={sign} className="card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">{renewal ? "Renew your self-billing agreement" : "Sign your self-billing agreement"}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Move Hub will raise your commission invoice each month, so you don&apos;t need to upload your own. This agreement would run from{" "}
          <strong className="text-white">{fmtDay(preview.startDate)}</strong> to <strong className="text-white">{fmtDay(preview.endDate)}</strong>.
          {!renewal && " Commission from before the start date is still invoiced the usual way."}
        </p>
        {new Date(`${preview.startDate}T00:00:00Z`) <= new Date() && (
          <p className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-secondary)" }}>
            This includes the current month, {new Date(`${preview.startDate}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}: Move Hub will invoice it for you at the start of next month, so please don&apos;t upload your own invoice for it.
          </p>
        )}
      </div>
      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg p-4 text-xs font-sans leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{preview.text}</pre>
      <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
        I have read this agreement and agree to Move Hub raising self-billed invoices on my behalf on these terms.
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Type your full name to sign</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-72 px-3 py-2 text-sm" autoComplete="name" />
        </div>
        <button type="submit" disabled={!agreed || saving} className="btn-primary px-4 py-2 text-sm">{saving ? "Signing…" : "Sign agreement"}</button>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Your typed name, the date and time, and the exact text above are stored as your signature. You&apos;ll get a confirmation email.</p>
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}

function InvoiceCard({ inv, onChange }: { inv: Invoice; onChange: () => void }) {
  const [querying, setQuerying] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credit = inv.kind === "CREDIT_NOTE";

  async function act(action: "accept" | "query") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/my/self-billing/invoices/${inv.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
      const body = await res.json();
      if (!res.ok) return setError(body.error || "Something went wrong");
      setQuerying(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3" style={inv.status === "VOID" ? { opacity: 0.6 } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-white">{credit ? "Credit note" : "Invoice"} {inv.number}</span>
          <span style={{ color: "var(--text-muted)" }}>· {inv.period}</span>
          {inv.originalNumber && <span style={{ color: "var(--text-muted)" }}>· against {inv.originalNumber}</span>}
          {inv.replacesNumber && <span style={{ color: "var(--text-muted)" }}>· replaces {inv.replacesNumber}</span>}
          <StatusPill inv={inv} />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-white">{formatPence(inv.grossPence)}</span>
          {inv.hasPdf && (
            <a href={`/api/my/self-billing/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" /> PDF
            </a>
          )}
        </div>
      </div>

      {inv.status === "ISSUED" && (
        <div className="rounded-lg p-3 text-sm space-y-2" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            Please check this and accept or query it by <strong className="text-white">{inv.queryBy}</strong>. After that it&apos;s treated as accepted.
          </p>
          {inv.queryResponse && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Move Hub&apos;s reply to your query: {inv.queryResponse}</p>}
          {querying ? (
            <div className="space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What looks wrong? e.g. a completion that's missing, or one that isn't yours" className="w-full px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button disabled={busy || !note.trim()} onClick={() => act("query")} className="btn-primary px-4 py-2 text-sm">Send query</button>
                <button onClick={() => setQuerying(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => act("accept")} className="btn-primary px-4 py-2 text-sm">Accept</button>
              <button disabled={busy} onClick={() => setQuerying(true)} className="btn-secondary px-4 py-2 text-sm">Query</button>
            </div>
          )}
        </div>
      )}
      {inv.status === "QUERIED" && (
        <p className="text-sm" style={{ color: "var(--warning)" }}>You queried this on {new Date(inv.queriedAt!).toLocaleDateString("en-GB")}: &ldquo;{inv.queryNote}&rdquo;. Move Hub will confirm it or send a corrected invoice.</p>
      )}
      {(inv.status === "ACCEPTED" || inv.status === "PAID") && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Accepted {new Date(inv.acceptedAt!).toLocaleDateString("en-GB")}{inv.acceptedHow === "DEEMED" ? " (no query within 5 working days)" : ""}.{" "}
          {inv.status === "PAID" ? `Paid ${new Date(inv.paidAt!).toLocaleDateString("en-GB")}.` : credit ? "" : `Payment due by ${inv.paymentDue}.`}
        </p>
      )}
      {inv.status === "VOID" && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Replaced{inv.replacedBy[0]?.number ? ` by ${inv.replacedBy[0].number}` : ""} after your query — no longer payable.</p>}

      <details className="text-xs">
        <summary className="cursor-pointer" style={{ color: "var(--text-muted)" }}>{inv.lines.length} line{inv.lines.length === 1 ? "" : "s"}</summary>
        <div className="mt-2"><LinesTable inv={inv} /></div>
      </details>
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
