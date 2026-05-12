import nodemailer from "nodemailer";
import { logger } from "./logger";

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string,
): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    logger.warn(
      { toEmail },
      "[Email] SMTP not configured — reset link logged below for manual use",
    );
    logger.warn({ resetLink }, "[Email] Reset link (manual)");
    return;
  }

  logger.info({ toEmail }, "[Email] Sending password reset email...");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Naam Jaap Sewa" <${smtpUser}>`,
      to: toEmail,
      subject: "Password Reset — Naam Jaap Sewa",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
          <h2 style="color: #c2410c; font-family: serif;">🔥 Naam Jaap Sewa</h2>
          <p>Pranam 🙏</p>
          <p>You requested a password reset. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}"
              style="background: #c2410c; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Reset My Password
            </a>
          </div>
          <p style="font-size: 13px; color: #666;">
            This link expires in <strong>1 hour</strong>.<br/>
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">
            "हारे का सहारा, बाबा श्याम हमारा" 🙏
          </p>
        </div>
      `,
    });
    logger.info({ toEmail, messageId: info.messageId }, "[Email] Sent successfully");
  } catch (err) {
    logger.error({ err, toEmail }, "[Email] Failed to send password reset email");
    throw err;
  }
}
