import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { AdminCommissionsClient } from "./AdminCommissionsClient";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const staff = await db.user.findMany({
    where: { status: { not: "DISABLED" }, intouchFeeEarnerName: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <div>
      <PageHeader title="Team Overview" description="Commission owed to each team member for a given month." />
      <AdminCommissionsClient
        staff={staff.map((s) => ({ id: s.id, name: s.name ?? s.email }))}
      />
    </div>
  );
}
