import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { AdminSelfBillingClient } from "./AdminSelfBillingClient";

export default async function AdminSelfBillingPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Self-billing" description="Monthly invoices Move Hub raises for progressors with a signed agreement. Review drafts, issue them, and handle queries." />
      <AdminSelfBillingClient />
    </div>
  );
}
