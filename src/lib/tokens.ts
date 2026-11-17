export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// An invite link can be used by someone who was invited, or by an account that
// ended up ACTIVE without ever setting a password (e.g. an invited user who was
// disabled then re-enabled, or enabled via the Holidays staff sync). Without
// this, those people can't log in and admins have no way to send them a link.
export function canUseInviteLink(user: { status: string; passwordHash: string | null }): boolean {
  return user.status === "INVITED" || (user.status === "ACTIVE" && !user.passwordHash);
}
