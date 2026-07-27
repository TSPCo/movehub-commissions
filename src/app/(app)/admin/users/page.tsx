export const dynamic = "force-dynamic";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UsersClient } from "./UsersClient";

export default async function AdminUsersPage() {
  const session = await requireAdmin();

  const [users, resetRequests] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, status: true, intouchFeeEarnerName: true, createdAt: true },
    }),
    db.passwordResetRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));
  const serializedResetRequests = resetRequests.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), user: r.user }));

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Staff</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Manage staff accounts, roles, and InTouch fee earner attribution.
      </p>
      <UsersClient initialUsers={serializedUsers} initialResetRequests={serializedResetRequests} currentUserId={session.sub} />
    </div>
  );
}
