import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { StaffDetailsForm } from "@/components/StaffDetailsForm";

export default async function MyDetailsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="My details" description="Your max open cases, and the details that go on your commission invoices." />
      <StaffDetailsForm endpoint="/api/my/details" ownerLabel="you" />
    </div>
  );
}
