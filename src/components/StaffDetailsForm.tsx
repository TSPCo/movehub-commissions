"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type Details = {
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  maxOpenCases: number | null;
  capacitySyncedAt: string | null;
  capacitySyncError: string | null;
  updatedAt: string;
};

type Payload = {
  details: Details | null;
  missing: string[];
  syncConfigured: boolean;
  capacityHistory: { fromValue: number | null; toValue: number | null; at: string; by: string }[];
};

type Form = {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  vatRegistered: boolean;
  vatNumber: string;
  maxOpenCases: string;
};

const toForm = (d: Details | null): Form => ({
  legalName: d?.legalName ?? "",
  addressLine1: d?.addressLine1 ?? "",
  addressLine2: d?.addressLine2 ?? "",
  city: d?.city ?? "",
  postcode: d?.postcode ?? "",
  vatRegistered: d?.vatRegistered ?? false,
  vatNumber: d?.vatNumber ?? "",
  maxOpenCases: d?.maxOpenCases != null ? String(d.maxOpenCases) : "",
});

const fmt = (v: number | null) => (v == null ? "not set" : String(v));

/**
 * One person's invoice details + max open cases. `endpoint` is /api/my/details
 * for the signed-in person, or /api/admin/users/:id/details for an admin.
 */
export function StaffDetailsForm({ endpoint, ownerLabel }: { endpoint: string; ownerLabel: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<Form>(toForm(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) return setError(body.error || "Couldn't load details");
        setData(body);
        setForm(toForm(body.details));
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error || "Something went wrong");
      setData(body);
      setForm(toForm(body.details));
      if (body.sync && !body.sync.ok) {
        setNotice(`Saved. Sales Progression hasn't picked up the new max cases yet (${body.sync.error}) — an admin can re-send it.`);
      } else {
        setNotice(body.capacityChanged ? "Saved, and the new max cases has been sent to Sales Progression." : "Saved.");
      }
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

  const field = (k: Exclude<keyof Form, "vatRegistered">, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input value={form[k]} onChange={(e) => set(k, e.target.value)} className="px-3 py-2 text-sm" {...props} />
    </div>
  );

  const d = data.details;

  return (
    <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-2 max-w-5xl" autoComplete="off">
      <section className="card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Max open cases</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            The most live files {ownerLabel === "you" ? "you're" : `${ownerLabel} is`} happy to carry. Shown to the team on the Sales
            Progression dashboard and used when new cases are assigned on the Imports page.
          </p>
        </div>
        {field("maxOpenCases", "Max open cases", { type: "number", min: 0, max: 500, inputMode: "numeric", placeholder: "e.g. 90", className: "px-3 py-2 text-sm w-32" })}
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Leave blank if you haven&apos;t decided yet.</p>
        {d?.maxOpenCases != null && (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: d.capacitySyncError ? "var(--warning)" : "var(--text-muted)" }}>
            {d.capacitySyncError ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {d.capacitySyncError
              ? `Not yet in Sales Progression: ${d.capacitySyncError}`
              : d.capacitySyncedAt
                ? `In Sales Progression since ${new Date(d.capacitySyncedAt).toLocaleString("en-GB")}`
                : "Waiting to be sent to Sales Progression"}
          </p>
        )}
        {data.capacityHistory.length > 0 && (
          <details className="text-xs" style={{ color: "var(--text-muted)" }}>
            <summary className="cursor-pointer">Change history</summary>
            <ul className="mt-2 space-y-1">
              {data.capacityHistory.map((h, i) => (
                <li key={i}>
                  {new Date(h.at).toLocaleString("en-GB")} — {fmt(h.fromValue)} → {fmt(h.toValue)} by {h.by}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Invoice details</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            What appears as the supplier on {ownerLabel === "you" ? "your" : "their"} commission invoices. Use {ownerLabel === "you" ? "your" : "their"} own
            name, or the business name {ownerLabel === "you" ? "you trade" : "they trade"} under.
          </p>
        </div>
        {data.missing.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs" style={{ color: "var(--warning)" }}>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Still needed: {data.missing.join(", ")}.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--success)" }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </p>
        )}
        {field("legalName", "Legal or trading name", { maxLength: 120, placeholder: "e.g. Sam Rodgers or Rodgers Progression Ltd" })}
        {field("addressLine1", "Address line 1", { maxLength: 120 })}
        {field("addressLine2", "Address line 2 (optional)", { maxLength: 120 })}
        <div className="grid grid-cols-2 gap-3">
          {field("city", "Town / city", { maxLength: 80 })}
          {field("postcode", "Postcode", { maxLength: 10, className: "px-3 py-2 text-sm uppercase" })}
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={form.vatRegistered} onChange={(e) => set("vatRegistered", e.target.checked)} />
          VAT registered
        </label>
        {form.vatRegistered && field("vatNumber", "VAT number", { maxLength: 20, placeholder: "GB123456789", className: "px-3 py-2 text-sm font-mono" })}
      </section>

      <div className="lg:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
          {saving ? "Saving…" : "Save"}
        </button>
        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
        {notice && <p className="text-sm" style={{ color: "var(--success)" }}>{notice}</p>}
        {d && !error && !notice && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Last updated {new Date(d.updatedAt).toLocaleString("en-GB")}</p>
        )}
      </div>
    </form>
  );
}
