import { randomUUID } from "node:crypto";

import type { NotificationProvider, SendEmailInput, SendEmailResult } from "./provider";

/**
 * Records every "send" instead of making a real HTTP call — what every
 * test in this codebase runs against, and what app.ts falls back to
 * outside test when RESEND_API_KEY isn't set (see env.ts), so local dev
 * without the key configured never errors and never fakes a real send.
 */
export class InMemoryNotificationProvider implements NotificationProvider {
  readonly sentEmails: (SendEmailInput & { id: string })[] = [];

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const id = randomUUID();
    this.sentEmails.push({ ...input, id });
    return { id };
  }
}
