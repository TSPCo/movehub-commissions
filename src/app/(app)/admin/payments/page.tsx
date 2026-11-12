import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { PaymentsClient } from "./PaymentsClient";
import { SelfBilledPayments } from "./SelfBilledPayments";

export default async function PaymentsPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Self-billed invoices to pay, invoices submitted against commission owed, and what's still outstanding per person."
      />
      <SelfBilledPayments />
      <PaymentsClient />
    </div>
  );
}
