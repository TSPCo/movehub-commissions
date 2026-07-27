"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { penceToPounds } from "@/lib/money";

type Settings = {
  commissionPerMatterPence: number;
  bonusUpliftPercent: number;
  bonusThresholdNumerator: number;
  bonusThresholdDenominator: number;
  intouchSyncSinceDate: string | null;
};

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    commissionPerMatterPounds: String(penceToPounds(settings.commissionPerMatterPence)),
    bonusUpliftPercent: String(settings.bonusUpliftPercent),
    bonusThresholdNumerator: String(settings.bonusThresholdNumerator),
    bonusThresholdDenominator: String(settings.bonusThresholdDenominator),
    intouchSyncSinceDate: settings.intouchSyncSinceDate ? settings.intouchSyncSinceDate.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionPerMatterPence: Math.round(Number(form.commissionPerMatterPounds) * 100),
        bonusUpliftPercent: Number(form.bonusUpliftPercent),
        bonusThresholdNumerator: Number(form.bonusThresholdNumerator),
        bonusThresholdDenominator: Number(form.bonusThresholdDenominator),
        intouchSyncSinceDate: form.intouchSyncSinceDate.trim() === "" ? null : form.intouchSyncSinceDate,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const field = "px-3 py-2 text-sm w-full";
  const label = "text-xs font-medium mb-1 block";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={label} style={{ color: "var(--text-secondary)" }}>Commission per completed matter (£)</label>
        <input type="number" step="0.01" required className={field} value={form.commissionPerMatterPounds} onChange={(e) => set("commissionPerMatterPounds", e.target.value)} />
      </div>
      <div>
        <label className={label} style={{ color: "var(--text-secondary)" }}>Bonus uplift (%)</label>
        <input type="number" step="0.1" required className={field} value={form.bonusUpliftPercent} onChange={(e) => set("bonusUpliftPercent", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} style={{ color: "var(--text-secondary)" }}>Bonus threshold — numerator</label>
          <input type="number" step="1" required className={field} value={form.bonusThresholdNumerator} onChange={(e) => set("bonusThresholdNumerator", e.target.value)} />
        </div>
        <div>
          <label className={label} style={{ color: "var(--text-secondary)" }}>Bonus threshold — denominator</label>
          <input type="number" step="1" required className={field} value={form.bonusThresholdDenominator} onChange={(e) => set("bonusThresholdDenominator", e.target.value)} />
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        e.g. numerator 1, denominator 3 = a team member needs to complete at least 1/3 (rounded down) of their
        month-start file count to earn the bonus uplift.
      </p>
      <div>
        <label className={label} style={{ color: "var(--text-secondary)" }}>
          Only count completions on or after this date — leave blank for no cutoff
        </label>
        <input
          type="date"
          className={field}
          value={form.intouchSyncSinceDate}
          onChange={(e) => set("intouchSyncSinceDate", e.target.value)}
        />
      </div>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {saved && <p className="text-sm" style={{ color: "var(--success)" }}>Saved.</p>}

      <button type="submit" disabled={saving} className="btn-primary self-start px-4 py-2 text-sm">
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
