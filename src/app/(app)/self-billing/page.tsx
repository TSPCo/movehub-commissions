import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { SelfBillingClient } from "./SelfBillingClient";

export default async function SelfBillingPage() {
  const session = await requireUser();
  if (session.role === "ADMIN") redirect("/admin/self-billing");
  return (
    <div>
      <PageHeader title="Self-billing" description="Move Hub raises your monthly commission invoice for you. Check each one and accept or query it." />
      <SelfBillingClient />
    </div>
  );
}
