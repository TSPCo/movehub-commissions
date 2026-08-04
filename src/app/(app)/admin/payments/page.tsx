import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { PaymentsClient } from "./PaymentsClient";

export default async function PaymentsPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Invoices submitted against commission owed, and what's still outstanding per person."
      />
      <PaymentsClient />
    </div>
  );
}
