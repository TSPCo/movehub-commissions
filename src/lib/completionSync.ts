import { db } from "@/lib/db";
import { fetchNewlyCompletedMatters, type CompletionSyncSummary } from "@/lib/intouch";
import { getSettings } from "@/lib/settings";

/**
 * Checks InTouch for newly-completed Move Hub matters and records each one,
 * attributing it to a User by matching the matter's InTouch fee earner name
 * against User.intouchFeeEarnerName (case-insensitive, trimmed). No match
 * still gets recorded (userId: null, handlerName kept) rather than silently
 * vanishing — fix the mismatch by correcting the fee earner name on the
 * Staff page, since each is a fixed one-to-one link to that person's email.
 */
export async function runCompletionSync(): Promise<CompletionSyncSummary> {
  const [existing, users, settings] = await Promise.all([
    db.completedMatter.findMany({ select: { intouchGuid: true } }),
    db.user.findMany({ where: { intouchFeeEarnerName: { not: null } }, select: { id: true, intouchFeeEarnerName: true } }),
    getSettings(),
  ]);

  const alreadyImported = new Set(existing.map((c) => c.intouchGuid));
  const userByName = new Map(users.map((u) => [u.intouchFeeEarnerName!.trim().toLowerCase(), u.id]));

  return fetchNewlyCompletedMatters(alreadyImported, settings.intouchSyncSinceDate, async (matter) => {
    const userId = matter.handlerName ? (userByName.get(matter.handlerName.trim().toLowerCase()) ?? null) : null;
    await db.completedMatter.create({
      data: {
        userId,
        intouchGuid: matter.guid,
        address: matter.address,
        postcode: matter.postcode,
        handlerName: matter.handlerName,
        completionDate: matter.completionDate,
      },
    });
  });
}
