function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

function layout(preheader: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <span style="display:none;font-size:0;color:#f4f5f7;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
            <tr>
              <td style="background-color:#6366F1;background:linear-gradient(135deg,#00D4FF 0%,#6366F1 40%,#EC4899 100%);padding:20px 28px;">
                <span style="color:#ffffff;font-size:16px;font-weight:700;">The Move Hub</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#111827;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="color:#9CA3AF;font-size:12px;margin-top:16px;">The Move Hub — Commissions</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function passwordResetEmail(opts: { name: string; resetUrl: string }) {
  const { name, resetUrl } = opts;

  return {
    subject: "Reset your Move Hub Commissions password",
    html: layout(
      "Reset your password",
      `
        <p>Hi ${firstName(name)},</p>
        <p>We got a request to reset your password. Click below to choose a new one — this link expires in an hour and can only be used once.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
          <tr><td style="background:linear-gradient(135deg,#00D4FF 0%,#6366F1 40%,#EC4899 100%);border-radius:8px;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:600;text-decoration:none;">Reset password</a>
          </td></tr>
        </table>
        <p style="color:#6B7280;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
      `
    ),
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Sent to the account owner and every admin whenever bank details are saved.
 * Deliberately shows only the last 4 digits — the full details never go by email.
 */
export function bankDetailsChangedEmail(opts: {
  ownerName: string;
  /** Who made the change, if it wasn't the owner themselves. */
  editorName: string | null;
  firstTime: boolean;
  accountLast4: string;
  at: Date;
}) {
  const owner = escapeHtml(opts.ownerName);
  const by = opts.editorName ? ` by ${escapeHtml(opts.editorName)}` : "";
  const what = opts.firstTime ? "added" : "changed";
  const when = opts.at.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

  return {
    subject: `Bank details ${what} for ${opts.ownerName}`,
    html: layout(
      `Bank details ${what}`,
      `
        <p>The bank details for <strong>${owner}</strong> in Move Hub Commissions were ${what}${by} on ${when}.</p>
        <p>Commission will now be paid to the account ending <strong>${escapeHtml(opts.accountLast4)}</strong>.</p>
        <p>If this wasn't expected, don't pay any invoices to the new account until you've confirmed it with ${owner} in person or by phone — not by replying to an email.</p>
        <p style="color:#6B7280;font-size:12px;">This email goes to the account holder and every admin whenever bank details are saved.</p>
      `
    ),
  };
}

// ─── Self-billing ───────────────────────────────────────────────────────────

const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="background:linear-gradient(135deg,#00D4FF 0%,#6366F1 40%,#EC4899 100%);border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:600;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;

export function selfBilledIssuedEmail(o: { name: string; number: string; period: string; total: string; queryBy: string; url: string; creditNote: boolean; reissue: boolean }) {
  const what = o.creditNote ? "credit note" : "invoice";
  return {
    subject: `Your self-billed ${what} ${o.number} — ${o.period}`,
    html: layout(
      `Self-billed ${what} ${o.number}`,
      `
        <p>Hi ${escapeHtml(firstName(o.name))},</p>
        <p>${o.reissue ? "Following your query, we've reissued" : "We've raised"} your self-billed ${what} <strong>${escapeHtml(o.number)}</strong> for ${escapeHtml(o.period)}: <strong>${escapeHtml(o.total)}</strong>. A copy is attached.</p>
        <p>Please check it and <strong>accept or query it by ${escapeHtml(o.queryBy)}</strong>. If we don't hear from you by then it's treated as accepted, under your self-billing agreement.</p>
        ${button(o.url, `Review ${what}`)}
      `
    ),
  };
}

export function selfBilledQueriedEmail(o: { progressor: string; number: string; note: string; url: string }) {
  return {
    subject: `Query on self-billed invoice ${o.number} from ${o.progressor}`,
    html: layout(
      "Invoice queried",
      `
        <p><strong>${escapeHtml(o.progressor)}</strong> has queried self-billed invoice <strong>${escapeHtml(o.number)}</strong>:</p>
        <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #6366F1;background:#F4F5F7;">${escapeHtml(o.note)}</blockquote>
        <p>Confirm it unchanged, or reissue it, from the Self-billing page.</p>
        ${button(o.url, "Open self-billing")}
      `
    ),
  };
}

export function selfBilledQueryAnsweredEmail(o: { name: string; number: string; response: string; queryBy: string; url: string }) {
  return {
    subject: `Your query on ${o.number} — invoice confirmed`,
    html: layout(
      "Query answered",
      `
        <p>Hi ${escapeHtml(firstName(o.name))},</p>
        <p>We've looked at your query on <strong>${escapeHtml(o.number)}</strong> and confirmed the invoice as it stands:</p>
        <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #6366F1;background:#F4F5F7;">${escapeHtml(o.response)}</blockquote>
        <p>Please accept it, or come back to us, by <strong>${escapeHtml(o.queryBy)}</strong>; after that it's treated as accepted.</p>
        ${button(o.url, "Review invoice")}
      `
    ),
  };
}

export function selfBilledDeemedEmail(o: { name: string; number: string; total: string; payBy: string }) {
  return {
    subject: `${o.number} accepted — payment due by ${o.payBy}`,
    html: layout(
      "Invoice accepted",
      `
        <p>Hi ${escapeHtml(firstName(o.name))},</p>
        <p>No query was raised on self-billed invoice <strong>${escapeHtml(o.number)}</strong> (${escapeHtml(o.total)}) within 5 working days, so under your self-billing agreement it's now accepted.</p>
        <p>It's due to be paid by <strong>${escapeHtml(o.payBy)}</strong>. If something's wrong, tell us and we'll correct it with a credit note or an additional invoice.</p>
      `
    ),
  };
}

export function selfBillingDraftsReadyEmail(o: { period: string; count: number; issueBy: string; warnings: number; url: string }) {
  return {
    subject: `${o.count} self-billed invoice${o.count === 1 ? "" : "s"} ready to review — ${o.period}`,
    html: layout(
      "Self-billed drafts ready",
      `
        <p>${o.count} draft self-billed invoice${o.count === 1 ? " is" : "s are"} ready for ${escapeHtml(o.period)}${o.warnings ? `, ${o.warnings} with warnings to check` : ""}.</p>
        <p>The agreement says they go out by <strong>${escapeHtml(o.issueBy)}</strong> (3 working days after month end).</p>
        ${button(o.url, "Review drafts")}
      `
    ),
  };
}

export function agreementSignedEmail(o: { name: string; start: string; end: string; forAdmin: boolean }) {
  return {
    subject: o.forAdmin ? `${o.name} signed a self-billing agreement` : "Your self-billing agreement with Move Hub",
    html: layout(
      "Self-billing agreement signed",
      o.forAdmin
        ? `<p><strong>${escapeHtml(o.name)}</strong> signed a self-billing agreement covering ${escapeHtml(o.start)} to ${escapeHtml(o.end)}. Their invoices will be raised automatically from then on.</p>`
        : `
          <p>Hi ${escapeHtml(firstName(o.name))},</p>
          <p>Thanks for signing. From <strong>${escapeHtml(o.start)}</strong> Move Hub will raise your monthly commission invoice for you, so there's no need to upload your own. Commission from before that date is invoiced the usual way.</p>
          <p>The agreement runs until ${escapeHtml(o.end)}. You can read it any time on the Self-billing page.</p>
        `
    ),
  };
}

export function agreementEndingEmail(o: { name: string; end: string; forAdmin: boolean; url: string }) {
  return {
    subject: o.forAdmin ? `${o.name}'s self-billing agreement ends ${o.end}` : `Your self-billing agreement ends on ${o.end}`,
    html: layout(
      "Self-billing agreement ending",
      o.forAdmin
        ? `<p><strong>${escapeHtml(o.name)}</strong>'s self-billing agreement ends on ${escapeHtml(o.end)}. They've been asked to sign a renewal.</p>`
        : `
          <p>Hi ${escapeHtml(firstName(o.name))},</p>
          <p>Your self-billing agreement with Move Hub ends on <strong>${escapeHtml(o.end)}</strong>. To keep Move Hub raising your invoices for you, sign the renewal on the Self-billing page — it carries on straight after the current one ends.</p>
          ${button(o.url, "Renew agreement")}
        `
    ),
  };
}

export function agreementEndedEmail(o: { name: string; lastDay: string; reason: string }) {
  return {
    subject: `Self-billing agreement ended — ${o.name}`,
    html: layout(
      "Self-billing agreement ended",
      `
        <p>The self-billing agreement for <strong>${escapeHtml(o.name)}</strong> has been ended. Move Hub will still invoice everything up to <strong>${escapeHtml(o.lastDay)}</strong>; after that, invoices are uploaded the usual way.</p>
        <p>Reason: ${escapeHtml(o.reason)}</p>
      `
    ),
  };
}
