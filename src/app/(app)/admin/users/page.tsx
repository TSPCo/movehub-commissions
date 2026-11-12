export const dynamic = "force-dynamic";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UsersClient } from "./UsersClient";
import { CapacitySyncPanel } from "./CapacitySyncPanel";
import { missingInvoiceFields } from "@/lib/staffDetails";
import { capacitySyncConfigured } from "@/lib/capacitySync";

export default async function AdminUsersPage() {
  const session = await requireAdmin();

  const [users, resetRequests] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        intouchFeeEarnerName: true,
        createdAt: true,
        peerDeleteRequestedAt: true,
        peerDeleteRequestedFrom: true,
        bankDetails: { select: { accountNumberLast4: true } },
        staffDetails: true,
      },
    }),
    db.passwordResetRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const serializedUsers = users.map(({ staffDetails, ...u }) => ({
    ...u,
    details: {
      maxOpenCases: staffDetails?.maxOpenCases ?? null,
      missing: missingInvoiceFields(staffDetails),
      syncError: staffDetails?.capacitySyncError ?? null,
    },
    createdAt: u.createdAt.toISOString(),
    peerDeleteRequestedAt: u.peerDeleteRequestedAt?.toISOString() ?? null,
  }));
  const serializedResetRequests = resetRequests.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), user: r.user }));

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Staff</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Manage staff accounts, roles, and InTouch fee earner attribution.
      </p>
      <CapacitySyncPanel configured={capacitySyncConfigured()} />
      <UsersClient initialUsers={serializedUsers} initialResetRequests={serializedResetRequests} currentUserId={session.sub} />
    </div>
  );
}
