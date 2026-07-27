import { redirect } from "next/navigation";
import Image from "next/image";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="flex min-h-full items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image src="/logo-icon.png" alt="Move Hub" width={48} height={48} className="rounded-xl" />
          <h1 className="text-lg font-bold tracking-tight leading-none">
            <span className="text-white">The Move </span>
            <span className="gradient-text">Hub</span>
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Commissions</p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
