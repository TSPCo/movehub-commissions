const FROM_EMAIL = process.env.EMAIL_FROM ?? "Move Hub Commissions <commissions@move-hub.co.uk>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/** Sends an email via Resend. No-ops (logging instead) when RESEND_API_KEY isn't set, so local dev and pre-DNS-verification deploys don't error out. */
export async function sendEmail(opts: SendEmailOptions): Promise<{ sent: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — would send:", { to: opts.to, subject: opts.subject });
    return { sent: false };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    console.error("[email] Resend error:", error);
    return { sent: false };
  }

  return { sent: true };
}
