/**
 * Email sending — docs/ARCHITECTURE.md §14 (the Email column of the
 * notification matrix: order receipt, delivery receipt, payout
 * processed). Push and SMS aren't built — this project has no APNs/FCM
 * or SMS-provider credentials, only a real Resend key (see
 * resend-provider.ts). Every send is best-effort: a notification failure
 * never blocks or reverts the booking/delivery/approval it's attached
 * to, same discipline as matching's onOrderBooked dispatch callback.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  id: string;
}

export interface NotificationProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
