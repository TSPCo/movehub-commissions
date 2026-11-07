import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { BankDetailsForm } from "@/components/BankDetailsForm";

export default async function MyBankDetailsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Bank details" description="Where your commission gets paid." />
      <BankDetailsForm endpoint="/api/my/bank-details" ownerLabel="you" />
    </div>
  );
}
