"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Admin tools for the max-open-cases link to Sales Progression (app.move-hub.co.uk). */
export function CapacitySyncPanel({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  async function run(action: "import" | "push-all") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/capacity-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ text: body.error || "Something went wrong", tone: "warn" });
        return;
      }
      if (action === "import") {
        const extra = body.notFound.length ? ` No staff account here for: ${body.notFound.join(", ")}.` : "";
        setMessage({
          text: `Imported ${body.imported} figure${body.imported === 1 ? "" : "s"} from Sales Progression (${body.alreadySet} already set here, left as they are).${extra}`,
          tone: body.notFound.length ? "warn" : "ok",
        });
      } else {
        const failed = body.failed.map((f: { email: string; error: string }) => `${f.email} (${f.error})`).join(", ");
        setMessage({ text: `Sent ${body.pushed} to Sales Progression.${failed ? ` Failed: ${failed}.` : ""}`, tone: failed ? "warn" : "ok" });
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mb-4 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p style={{ color: "var(--text-secondary)" }}>
          Max open cases is set here and copied to Sales Progression&apos;s dashboard and Imports page.
          {!configured && <span style={{ color: "var(--warning)" }}> The link isn&apos;t switched on yet (SALES_PROGRESSION_URL / CAPACITY_SYNC_SECRET).</span>}
        </p>
        <div className="flex gap-2">
          <button onClick={() => run("import")} disabled={!configured || !!busy} className="btn-secondary px-3 py-1.5 text-xs">
            {busy === "import" ? "Importing…" : "Import current figures"}
          </button>
          <button onClick={() => run("push-all")} disabled={!configured || !!busy} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            {busy === "push-all" ? "Sending…" : "Re-send all"}
          </button>
        </div>
      </div>
      {message && (
        <p className="mt-2 text-xs" style={{ color: message.tone === "ok" ? "var(--success)" : "var(--warning)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
