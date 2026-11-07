"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, FileSearch, Lock } from "lucide-react";

type Saved = {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  revealed: boolean;
  updatedAt: string;
  lastChangedAt: string | null;
};

type Response = { configured: boolean; details: Saved | null; unreadable?: boolean };

type Suggestion = {
  suggestion: { accountName: string; sortCode: string; accountNumber: string } | null;
  basis: string | null;
  invoicesRead: number;
  invoicesWithDetails: number;
  agreeing: number;
  otherAccounts: { sortCode: string; accountLast4: string; fileName: string; createdAt: string }[];
};

/**
 * View / edit one person's bank details. `endpoint` is /api/my/bank-details for
 * the signed-in person, or /api/admin/users/:id/bank-details for an admin.
 * `suggestEndpoint` (admin only) adds a button that pre-fills the form from
 * their stored invoices — nothing is saved until the admin clicks Save.
 */
export function BankDetailsForm({
  endpoint,
  ownerLabel,
  suggestEndpoint,
}: {
  endpoint: string;
  ownerLabel: string;
  suggestEndpoint?: string;
}) {
  const [data, setData] = useState<Response | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ accountName: "", sortCode: "", accountNumber: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  async function fillFromInvoices() {
    if (!suggestEndpoint) return;
    setSuggesting(true);
    setError(null);
    setNotice(null);
    setSuggestion(null);
    try {
      const res = await fetch(suggestEndpoint, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't read their invoices");
        return;
      }
      const s = body as Suggestion;
      setSuggestion(s);
      if (s.suggestion) {
        setForm(s.suggestion);
        setEditing(true);
      } else {
        setError(`Read ${s.invoicesRead} invoice${s.invoicesRead === 1 ? "" : "s"} but none showed a full sort code and account number.`);
      }
    } finally {
      setSuggesting(false);
    }
  }

  const fillButton = suggestEndpoint && (
    <button type="button" onClick={fillFromInvoices} disabled={suggesting} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
      <FileSearch className="h-3.5 w-3.5" />
      {suggesting ? "Reading their invoices…" : "Fill from their invoices"}
    </button>
  );

  const load = useCallback(
    async (reveal = false) => {
      const res = await fetch(`${endpoint}${reveal ? "?reveal=1" : ""}`, { cache: "no-store" });
      const body = (await res.json()) as Response & { error?: string };
      if (!res.ok) {
        setError(body.error || "Couldn't load bank details");
        return;
      }
      setData(body);
    },
    [endpoint]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: (await res.json()) as Response & { error?: string } }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) setData(body);
        else setError(body.error || "Couldn't load bank details");
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  async function startEditing() {
    setError(null);
    setNotice(null);
    setSuggestion(null);
    setForm({ accountName: data?.details?.accountName ?? "", sortCode: "", accountNumber: "" });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Something went wrong");
        return;
      }
      setEditing(false);
      setSuggestion(null);
      setForm({ accountName: "", sortCode: "", accountNumber: "" });
      setNotice(body.changed ? "Saved. A confirmation email has gone to the account holder and the admin team." : "No changes — those are the details already on file.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="card p-5 text-sm" style={{ color: "var(--text-muted)" }}>
        {error ?? "Loading…"}
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className="card p-5 text-sm" style={{ color: "var(--text-secondary)" }}>
        Bank details aren&apos;t switched on yet — an admin needs to finish setting this up.
      </div>
    );
  }

  const saved = data.details;

  return (
    <div className="card p-5 max-w-xl">
      <div className="mb-4 flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Stored encrypted. Only {ownerLabel} and Move Hub admins can see these. Any change emails the account holder and the admin team.</span>
      </div>

      {data.unreadable && (
        <p className="mb-3 text-sm" style={{ color: "var(--warning)" }}>
          The saved details couldn&apos;t be read — please enter them again.
        </p>
      )}

      {!editing && saved && (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt style={{ color: "var(--text-muted)" }}>Account name</dt>
            <dd className="col-span-2 font-medium">{saved.accountName}</dd>
            <dt style={{ color: "var(--text-muted)" }}>Sort code</dt>
            <dd className="col-span-2 font-mono">{saved.sortCode}</dd>
            <dt style={{ color: "var(--text-muted)" }}>Account number</dt>
            <dd className="col-span-2 font-mono">{saved.accountNumber}</dd>
          </dl>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Last updated {new Date(saved.updatedAt).toLocaleString("en-GB")}
          </p>
          <div className="flex gap-2">
            <button onClick={() => load(!saved.revealed)} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              {saved.revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {saved.revealed ? "Hide" : "Show full details"}
            </button>
            <button onClick={startEditing} className="btn-secondary px-3 py-1.5 text-xs">
              Change details
            </button>
            {fillButton}
          </div>
        </div>
      )}

      {!editing && !saved && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No bank details saved yet. Add them so invoices can be checked against the account you&apos;re paid into.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={startEditing} className="btn-primary px-4 py-2 text-sm">
              Add bank details
            </button>
            {fillButton}
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSave} className="space-y-3" autoComplete="off">
          {suggestion?.suggestion && (
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-secondary)" }}>
                Filled in from their {suggestion.basis}. {suggestion.agreeing} of {suggestion.invoicesWithDetails} invoice
                {suggestion.invoicesWithDetails === 1 ? "" : "s"} with bank details show this account
                {suggestion.invoicesRead > suggestion.invoicesWithDetails
                  ? ` (${suggestion.invoicesRead - suggestion.invoicesWithDetails} had none or couldn't be read)`
                  : ""}
                . Check it before saving — nothing is saved yet.
              </p>
              {suggestion.otherAccounts.length > 0 && (
                <div style={{ color: "var(--warning)" }}>
                  <p className="font-medium">Their invoices also show a different account:</p>
                  <ul className="list-disc pl-5">
                    {suggestion.otherAccounts.map((a, i) => (
                      <li key={i}>
                        {a.sortCode}, ending {a.accountLast4} — {a.fileName} ({new Date(a.createdAt).toLocaleDateString("en-GB")})
                      </li>
                    ))}
                  </ul>
                  <p>Confirm with them which is right before saving.</p>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Name on the account</label>
            <input
              required
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              className="px-3 py-2 text-sm"
              placeholder="e.g. Sam Rodgers"
              maxLength={70}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Sort code</label>
              <input
                required
                inputMode="numeric"
                value={form.sortCode}
                onChange={(e) => setForm({ ...form, sortCode: e.target.value })}
                className="px-3 py-2 text-sm font-mono"
                placeholder="12-34-56"
                maxLength={8}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Account number</label>
              <input
                required
                inputMode="numeric"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                className="px-3 py-2 text-sm font-mono"
                placeholder="12345678"
                maxLength={10}
              />
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Use the same details you put on your invoices — the invoice check compares the two.
          </p>
          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && notice && <p className="mt-3 text-sm" style={{ color: "var(--success)" }}>{notice}</p>}
      {!editing && error && <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
