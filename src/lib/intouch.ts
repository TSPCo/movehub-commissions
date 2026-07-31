const INTOUCH_BASE = "https://go.intouchapp.co.uk/api/v2/public";
const COMPLETION_TASK_NAME = "Completion";

// InTouch enforces 60 requests/60s ACCOUNT-WIDE — shared with movehub-invoicing,
// sales-progression, and tspc-invoicing on the same API key, not per-app. 1050ms
// between requests works out to ~57/min — safely under, with margin for clock
// imprecision and the other apps' own usage. Centralized here so it applies no
// matter which function makes the call.
const MIN_REQUEST_INTERVAL_MS = 1050;

export interface IntouchMatter {
  state: string;
  reference: string;
  guid: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  postcode?: string;
  feeEarnerFullName?: string;
  feeEarnerTeamName?: string;
}

interface IntouchTask {
  name: string;
  isCompleted: boolean;
  completedOn: string | null;
}

export class IntouchApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isIntouchConfigured(): boolean {
  return !!process.env.INTOUCH_API_KEY;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await delay(wait);
  lastRequestAt = Date.now();
}

// Someone else on the shared account (another one of the sibling apps using
// this same INTOUCH_API_KEY, or a concurrent manual run) can burn through the
// account-wide budget even though this app's own throttle() keeps it under
// 60/60s alone. Rather than giving up quickly, a 429 here just waits out
// whatever InTouch's own error tells us to wait — "You may only make 60
// requests per 60 seconds. Try again in N seconds." — plus a small buffer,
// and retries. Sync runs are manual/daily and not time-sensitive, so patience
// is cheap; MAX_RATE_LIMIT_WAIT_MS is only a backstop against a genuinely
// stuck (e.g. misconfigured) key looping forever, not a realistic ceiling.
const DEFAULT_RATE_LIMIT_WAIT_MS = 65_000;
const MAX_RATE_LIMIT_WAIT_MS = 30 * 60 * 1000;

function parseRetryAfterMs(message: string | undefined): number {
  const match = message?.match(/(\d+)\s*seconds?/i);
  if (!match) return DEFAULT_RATE_LIMIT_WAIT_MS;
  return (Number(match[1]) + 2) * 1000;
}

async function intouchFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = process.env.INTOUCH_API_KEY;
  if (!apiKey) throw new IntouchApiError(503, "InTouch API key not configured");

  const url = new URL(`${INTOUCH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let totalWaitedMs = 0;
  while (true) {
    await throttle();
    const res = await fetch(url, {
      headers: { "x-intouch-o-token": apiKey, "content-type": "application/json; charset=utf-8" },
    });

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const waitMs = parseRetryAfterMs(body?.message);
      totalWaitedMs += waitMs;
      if (totalWaitedMs > MAX_RATE_LIMIT_WAIT_MS) {
        throw new IntouchApiError(429, body?.message ?? "InTouch rate limit exceeded — gave up after 30 minutes of waiting");
      }
      await delay(waitMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new IntouchApiError(res.status, body?.message ?? `InTouch request failed (${res.status})`);
    }

    return res.json();
  }
}

/** Paginates through the full matter book once. */
async function fetchAllMatters(): Promise<IntouchMatter[]> {
  const pageSize = 100;
  const all: IntouchMatter[] = [];
  let page = 1;

  while (true) {
    const body = await intouchFetch("/matters/list", { page: String(page), pageSize: String(pageSize) });
    const matters: IntouchMatter[] = body?.data?.matters ?? [];
    all.push(...matters);

    if (matters.length < pageSize) break;
    page += 1;
  }

  return all;
}

/** Only Move Hub's own fee-earner teams (e.g. "Move Hub Team Baker") are relevant. */
function isMoveHubTeam(matter: IntouchMatter): boolean {
  return (matter.feeEarnerTeamName ?? "").toLowerCase().includes("move hub");
}

/** Move Hub's matter book, excluding aborted deals (no commission due on a fall-through). */
export async function fetchMoveHubMatters(): Promise<IntouchMatter[]> {
  const matters = await fetchAllMatters();
  return matters.filter((m) => isMoveHubTeam(m) && m.state !== "Aborted");
}

/** Looks up a single matter's task checklist and returns its completion date, if done. */
export async function getCompletionDate(matterGuid: string): Promise<Date | null> {
  const body = await intouchFetch(`/matters/${matterGuid}/tasks`);
  const tasks: IntouchTask[] = body?.data?.tasks ?? [];
  const completionTask = tasks.find((t) => t.name === COMPLETION_TASK_NAME);
  if (!completionTask?.isCompleted || !completionTask.completedOn) return null;
  return new Date(completionTask.completedOn);
}

/** Current open-matter count per InTouch fee earner — same query sales-progression's dashboard uses, just kept locally so this app's month-start snapshots don't depend on that app. */
export async function getOpenFileCountsByFeeEarner(): Promise<Map<string, number>> {
  const matters = await fetchMoveHubMatters();
  const counts = new Map<string, number>();
  for (const matter of matters) {
    if (matter.state !== "Open") continue;
    const feeEarner = matter.feeEarnerFullName?.trim();
    if (!feeEarner) continue;
    counts.set(feeEarner, (counts.get(feeEarner) ?? 0) + 1);
  }
  return counts;
}

export interface CompletedMatterFound {
  guid: string;
  reference: string;
  address: string;
  postcode: string | null;
  handlerName: string | null;
  completionDate: Date;
}

export interface CompletionSyncSummary {
  checked: number;
  found: number;
  skippedAlreadyImported: number;
  ignoredBeforeCutoff: number;
  failed: number;
  stoppedEarly: boolean;
}

/**
 * Fetches Move Hub's matter book and checks each matter not already known
 * (via `alreadyImportedGuids`) for a completed "Completion" task, calling
 * `onCompletionFound` immediately for each one so the caller can persist it
 * right away — if something goes wrong partway through (rate limiting, a
 * network blip), whatever's already been found stays saved rather than
 * being lost when the whole run throws.
 *
 * A single matter's lookup failing is logged and skipped, not fatal. If
 * InTouch's rate limit is hit hard enough to exhaust retries, the loop stops
 * early (rather than hammering a limit it's already over) and returns
 * everything found so far with `stoppedEarly: true`.
 */
export async function fetchNewlyCompletedMatters(
  alreadyImportedGuids: Set<string>,
  sinceDate: Date | null,
  onCompletionFound: (matter: CompletedMatterFound) => Promise<void>
): Promise<CompletionSyncSummary> {
  const matters = await fetchMoveHubMatters();
  const toCheck = matters.filter((m) => !alreadyImportedGuids.has(m.guid));

  let found = 0;
  let ignoredBeforeCutoff = 0;
  let failed = 0;
  let stoppedEarly = false;
  let checked = 0;

  for (const matter of toCheck) {
    try {
      const completionDate = await getCompletionDate(matter.guid);
      checked++;
      if (completionDate) {
        if (sinceDate && completionDate < sinceDate) {
          ignoredBeforeCutoff++;
        } else {
          await onCompletionFound({
            guid: matter.guid,
            reference: matter.reference,
            address: matter.addressLine1?.trim() || matter.reference,
            postcode: matter.postcode?.trim() || null,
            handlerName: matter.feeEarnerFullName?.trim() || null,
            completionDate,
          });
          found++;
        }
      }
    } catch (err) {
      if (err instanceof IntouchApiError && err.status === 429) {
        stoppedEarly = true;
        break;
      }
      failed++;
    }
  }

  return { checked, found, skippedAlreadyImported: matters.length - toCheck.length, ignoredBeforeCutoff, failed, stoppedEarly };
}
