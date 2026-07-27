import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { SettingsForm } from "./SettingsForm";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <div>
      <PageHeader title="Settings" description="The commission scheme applied to every team member." />
      <div className="card max-w-2xl p-6">
        <SettingsForm
          settings={{
            commissionPerMatterPence: settings.commissionPerMatterPence,
            bonusUpliftPercent: settings.bonusUpliftPercent,
            bonusThresholdNumerator: settings.bonusThresholdNumerator,
            bonusThresholdDenominator: settings.bonusThresholdDenominator,
            intouchSyncSinceDate: settings.intouchSyncSinceDate ? settings.intouchSyncSinceDate.toISOString() : null,
          }}
        />
      </div>
    </div>
  );
}
