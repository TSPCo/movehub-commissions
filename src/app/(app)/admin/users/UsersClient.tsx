"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UserItem = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "STAFF";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  intouchFeeEarnerName: string | null;
  createdAt: string;
};

type ResetRequestItem = {
  id: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};

const STATUS_STYLES: Record<UserItem["status"], { bg: string; color: string; label: string }> = {
  INVITED: { bg: "rgba(245,158,11,0.15)", color: "var(--warning)", label: "Invited" },
  ACTIVE: { bg: "rgba(34,197,94,0.15)", color: "var(--success)", label: "Active" },
  DISABLED: { bg: "rgba(148,163,184,0.15)", color: "var(--text-muted)", label: "Disabled" },
};

function LinkBanner({ label, url, onDismiss }: { label: string; url: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the input below can still be selected and copied manually.
    }
  }

  return (
    <div className="card p-4 mb-4" style={{ borderColor: "var(--blue)" }}>
      <p className="text-xs font-medium mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="flex-1 px-3 py-2 text-xs" />
        <button onClick={copy} className="rounded-lg px-3 py-2 text-xs font-medium shrink-0" style={{ background: "var(--gradient)", color: "#fff" }}>
          {copied ? "Copied!" : "Copy"}
        </button>
        <button onClick={onDismiss} className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function UsersClient({
  initialUsers,
  initialResetRequests,
  currentUserId,
}: {
  initialUsers: UserItem[];
  initialResetRequests: ResetRequestItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [resetRequests, setResetRequests] = useState(initialResetRequests);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [passwordResetId, setPasswordResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ label: string; url: string } | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: "", role: "STAFF", intouchFeeEarnerName: "" });
  const [inviting, setInviting] = useState(false);

  async function updateUser(id: string, data: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...body.user } : u)));
    router.refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Something went wrong");
        return;
      }
      setUsers((prev) => [...prev, body.user]);
      setLink({ label: `Invite created for ${inviteForm.email} — copy this link and send it to them:`, url: body.inviteUrl });
      setInviteForm({ email: "", role: "STAFF", intouchFeeEarnerName: "" });
      setShowInviteForm(false);
      router.refresh();
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(id: string, email: string) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}/resend-invite`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong");
      return;
    }
    setLink({ label: `New invite link for ${email} — copy this link and send it to them:`, url: body.inviteUrl });
  }

  async function handleCancelInvite(id: string) {
    if (!confirm("Cancel this invite? The link will stop working.")) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    router.refresh();
  }

  async function handleDeleteUser(id: string, label: string) {
    if (!confirm(`Delete ${label}? This permanently removes their account and login. Any completed matters attributed to them become unassigned rather than being deleted.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    router.refresh();
  }

  async function handleResetPassword(id: string) {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    await updateUser(id, { password: newPassword });
    setPasswordResetId(null);
    setNewPassword("");
  }

  async function reviewResetRequest(id: string, action: "approve" | "dismiss") {
    setError(null);
    const res = await fetch(`/api/admin/reset-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Something went wrong");
      return;
    }
    const request = resetRequests.find((r) => r.id === id);
    setResetRequests((prev) => prev.filter((r) => r.id !== id));
    if (action === "approve" && request) {
      setLink({ label: `Password reset link for ${request.user.email} — copy this link and send it to them:`, url: body.resetUrl });
    }
    router.refresh();
  }

  return (
    <div>
      {link && <LinkBanner label={link.label} url={link.url} onDismiss={() => setLink(null)} />}

      {resetRequests.length > 0 && (
        <div className="card p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3">Password reset requests</h2>
          <div className="flex flex-col gap-2">
            {resetRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.user.name ?? r.user.email}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => reviewResetRequest(r.id, "approve")}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "rgba(34,197,94,0.15)", color: "var(--success)" }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reviewResetRequest(r.id, "dismiss")}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "rgba(148,163,184,0.15)", color: "var(--text-muted)" }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <button onClick={() => setShowInviteForm((v) => !v)} className="btn-primary px-4 py-2 text-sm">
          {showInviteForm ? "Cancel" : "Invite staff member"}
        </button>
      </div>

      {showInviteForm && (
        <form onSubmit={handleInvite} className="card p-5 mb-4 grid grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Email</label>
            <input required type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} className="px-3 py-2 text-sm w-full" placeholder="name@move-hub.co.uk" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Role</label>
            <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="px-3 py-2 text-sm w-full">
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>InTouch fee earner name</label>
            <input
              type="text"
              value={inviteForm.intouchFeeEarnerName}
              onChange={(e) => setInviteForm({ ...inviteForm, intouchFeeEarnerName: e.target.value })}
              className="px-3 py-2 text-sm w-full"
              placeholder="e.g. Sam Rodgers"
            />
          </div>
          <div>
            <button type="submit" disabled={inviting} className="btn-primary px-4 py-2 text-sm w-full">
              {inviting ? "Creating…" : "Create invite"}
            </button>
          </div>
          <p className="col-span-4 text-xs" style={{ color: "var(--text-muted)" }}>
            They&apos;ll set their own name and password when they open the invite link.
          </p>
          <p className="col-span-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Must exactly match this person&apos;s name in InTouch (e.g. &quot;Sam Rodgers&quot;) so their completions get attributed correctly. Can be added later.
          </p>
        </form>
      )}

      {error && <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Name", "Email", "Role", "InTouch fee earner", "Status", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">
                  {u.name ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Pending invite</span>}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    disabled={u.id === currentUserId}
                    className="px-2 py-1 text-xs"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    defaultValue={u.intouchFeeEarnerName ?? ""}
                    title={`Must exactly match this person's name in InTouch (e.g. "Sam Rodgers") so their completions get attributed correctly. Can be added later.`}
                    placeholder="Not set"
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (val !== (u.intouchFeeEarnerName ?? "")) updateUser(u.id, { intouchFeeEarnerName: val });
                    }}
                    className="w-36 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  {u.status === "INVITED" ? (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: STATUS_STYLES.INVITED.bg, color: STATUS_STYLES.INVITED.color }}>
                      {STATUS_STYLES.INVITED.label}
                    </span>
                  ) : (
                    <button
                      onClick={() => updateUser(u.id, { status: u.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })}
                      disabled={u.id === currentUserId}
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: STATUS_STYLES[u.status].bg, color: STATUS_STYLES[u.status].color }}
                    >
                      {STATUS_STYLES[u.status].label}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.status === "INVITED" ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleResendInvite(u.id, u.email)} className="text-xs font-medium" style={{ color: "var(--cyan)" }}>
                        Copy link
                      </button>
                      <button onClick={() => handleCancelInvite(u.id)} className="text-xs font-medium" style={{ color: "var(--danger)" }}>
                        Cancel
                      </button>
                    </div>
                  ) : passwordResetId === u.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-28 px-2 py-1 text-xs"
                      />
                      <button onClick={() => handleResetPassword(u.id)} className="text-xs font-medium" style={{ color: "var(--cyan)" }}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setPasswordResetId(u.id);
                          setNewPassword("");
                        }}
                        className="text-xs font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Reset password
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.name ?? u.email)}
                          className="text-xs font-medium"
                          style={{ color: "var(--danger)" }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
