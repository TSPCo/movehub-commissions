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
