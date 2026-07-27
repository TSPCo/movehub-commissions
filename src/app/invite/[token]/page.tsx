import Image from "next/image";
import { db } from "@/lib/db";
import { InviteForm } from "./InviteForm";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.user.findUnique({ where: { inviteToken: token } });
  const valid = !!user && user.status === "INVITED" && !!user.inviteTokenExpiry && user.inviteTokenExpiry > new Date();

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
          {valid ? (
            <InviteForm token={token} email={user.email} />
          ) : (
            <div className="text-center">
              <p className="text-sm font-medium mb-1">This invite link is no longer valid</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                It may have expired or already been used. Ask an admin to send you a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
