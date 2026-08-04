import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { MyCommissionClient } from "./MyCommissionClient";

export default async function MyCommissionPage() {
  const session = await requireUser();

  // Admins don't personally earn commission — send them straight to the
  // page they actually use instead of a "My Commission" screen with nothing
  // relevant on it.
  if (session.role === "ADMIN") redirect("/admin");

  return (
    <div>
      <PageHeader title="My Commission" description={`Hi ${session.name} — your commission tracker.`} />
      <MyCommissionClient />
    </div>
  );
}
