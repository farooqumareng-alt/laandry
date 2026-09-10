import type { NotificationProvider, SendEmailInput, SendEmailResult } from "./provider";

/**
 * The real thing — unlike every payment/push/SMS provider in this
 * codebase, which stayed fake because no live credentials existed
 * (see payments/provider.ts's comment on that), this one actually calls
 * Resend's API. Plain `fetch` against their REST endpoint rather than
 * their SDK — one POST, no new dependency for it.
 */
export class ResendNotificationProvider implements NotificationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
    const body = (await res.json()) as { id: string };
    return { id: body.id };
  }
}
