import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { MyCommissionClient } from "./MyCommissionClient";

export default async function MyCommissionPage() {
  const session = await requireUser();

  return (
    <div>
      <PageHeader title="My Commission" description={`Hi ${session.name} — your commission tracker.`} />
      <MyCommissionClient />
    </div>
  );
}
