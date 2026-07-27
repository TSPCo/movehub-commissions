"use client";

import { useState } from "react";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMessage(data.message ?? "If an account exists for that email, an admin has been notified.");
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (message) {
    return (
      <div className="text-center">
        <p className="text-sm">{message}</p>
        <Link href="/login" className="text-xs mt-4 inline-block" style={{ color: "var(--cyan)" }}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">Forgot your password?</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Enter your work email and an admin will approve a reset link for you.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 text-sm w-full"
          placeholder="you@move-hub.co.uk"
        />
      </div>

      <button type="submit" disabled={submitting} className="btn-primary mt-1 w-full py-2.5 text-sm">
        {submitting ? "Sending…" : "Request reset link"}
      </button>

      <Link href="/login" className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
        Back to sign in
      </Link>
    </form>
  );
}
