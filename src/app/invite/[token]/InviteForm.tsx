"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">Welcome to The Move Hub</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Set up your account for {email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="firstName" className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>First name</label>
          <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="px-3 py-2 text-sm w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lastName" className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Surname</label>
          <input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="px-3 py-2 text-sm w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Password</label>
        <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="px-3 py-2 text-sm w-full" placeholder="At least 8 characters" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Confirm password</label>
        <input id="confirmPassword" type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="px-3 py-2 text-sm w-full" />
      </div>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary mt-1 w-full py-2.5 text-sm">
        {submitting ? "Setting up…" : "Set up account"}
      </button>
    </form>
  );
}
