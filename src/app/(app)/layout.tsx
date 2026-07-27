import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return (
    <div className="flex h-full">
      <Sidebar user={{ name: session.name, email: session.email, role: session.role }} />
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
