import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { AdminCommissionsClient } from "./AdminCommissionsClient";

export default async function AdminOverviewPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader title="Team Overview" description="Commission owed to each team member for a given month." />
      <AdminCommissionsClient />
    </div>
  );
}
