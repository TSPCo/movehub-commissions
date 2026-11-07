export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { BankDetailsForm } from "@/components/BankDetailsForm";

export default async function StaffBankDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!user) notFound();
  const label = user.name ?? user.email;

  return (
    <div>
      <Link href="/admin/users" className="text-xs" style={{ color: "var(--text-muted)" }}>
        ← Staff
      </Link>
      <PageHeader title={`Bank details — ${label}`} description={user.email} />
      <BankDetailsForm
        endpoint={`/api/admin/users/${user.id}/bank-details`}
        suggestEndpoint={`/api/admin/users/${user.id}/bank-details/suggest`}
        ownerLabel={label}
      />
    </div>
  );
}
