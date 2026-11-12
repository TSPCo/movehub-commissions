import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { StaffDetailsForm } from "@/components/StaffDetailsForm";
import { STAFF_MAX_OPEN_CASES } from "@/lib/staffDetails";

export default async function MyDetailsPage() {
  const session = await requireUser();
  return (
    <div>
      <PageHeader title="My details" description="Your max open cases, and the details that go on your commission invoices." />
      <StaffDetailsForm endpoint="/api/my/details" ownerLabel="you" staffCap={session.role === "ADMIN" ? undefined : STAFF_MAX_OPEN_CASES} />
    </div>
  );
}
