"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Wallet, Users, UserCog, Settings, LogOut, Receipt } from "lucide-react";

type Props = {
  user: { name: string; email: string; role: "ADMIN" | "STAFF" };
};

const nav = [
  { href: "/", label: "My Commission", icon: Wallet, roles: ["STAFF"] as const },
  { href: "/admin", label: "Team Overview", icon: Users, roles: ["ADMIN"] as const },
  { href: "/admin/payments", label: "Payments", icon: Receipt, roles: ["ADMIN"] as const },
  { href: "/admin/users", label: "Staff", icon: UserCog, roles: ["ADMIN"] as const },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] as const },
];

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col" style={{ background: "var(--bg-card)", borderRight: "1px solid var(--border)" }}>
      <div className="flex h-14 items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Image src="/logo-icon.png" alt="Move Hub" width={32} height={32} className="shrink-0 rounded-lg" />
        <span className="text-sm font-bold tracking-tight leading-none">
          <span className="text-white">The Move </span>
          <span className="gradient-text">Hub</span>
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {nav
          .filter((item) => (item.roles as readonly string[]).includes(user.role))
          .map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                style={
                  active
                    ? { background: "rgba(99,102,241,0.15)", color: "var(--cyan)", borderLeft: "2px solid var(--blue)" }
                    : { color: "var(--text-secondary)", borderLeft: "2px solid transparent" }
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
      </nav>

      <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="rounded-xl px-3 py-2 mb-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-medium text-white truncate">{user.name}</p>
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
