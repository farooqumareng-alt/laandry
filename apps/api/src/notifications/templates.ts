import type { QuoteLineItem, ServiceType } from "@laandry/domain";

/**
 * Pure content builders — no I/O, so these are trivially unit-tested
 * without a fake network call. `provider.ts`'s implementations only ever
 * see the finished {subject, html, text} triple these return. Copy
 * follows the same brand voice as the rest of the product ("time back,"
 * calm and specific, no dark patterns, no fake urgency).
 */

function centsToLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatWindow(start: Date, end: Date): string {
  const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  EVERYDAY_LAUNDRY: "Everyday Laundry",
  FORMAL_SPECIAL_CARE: "Formal & Special Care",
  BEDDING_HOUSEHOLD: "Bedding & Household",
  TRAVEL: "Travel",
};

function wrap(bodyHtml: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2421;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;padding:32px;">
        <tr><td style="font-size:20px;font-weight:700;color:#2f6b63;padding-bottom:20px;">Laandry</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="font-size:12.5px;color:#8a9490;padding-top:28px;">
          Laandry — laundry picked up, cared for, and returned. Questions? Reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface OrderScheduledEmailInput {
  service: ServiceType;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  lineItems: QuoteLineItem[];
  totalCents: number;
}

export function orderScheduledEmail(input: OrderScheduledEmailInput): { subject: string; html: string; text: string } {
  const subject = "Your Laandry is scheduled";
  const window = formatWindow(input.pickupWindowStart, input.pickupWindowEnd);
  const lines = input.lineItems.map((li) => `${li.label}: ${centsToLabel(li.amountCents)}`);

  const text = [
    `We've got you down for pickup ${window}.`,
    "",
    SERVICE_LABELS[input.service],
    ...lines,
    `Estimated total: ${centsToLabel(input.totalCents)}`,
    "",
    "We'll let you know as soon as a provider is on the way.",
    "",
    "— Laandry",
  ].join("\n");

  const html = wrap(`
    <p style="margin:0 0 16px;">We've got you down for pickup <strong>${window}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dedad0;border-radius:10px;padding:16px;margin-bottom:16px;">
      <tr><td style="font-weight:600;padding-bottom:10px;">${SERVICE_LABELS[input.service]}</td></tr>
      ${input.lineItems
        .map(
          (li) =>
            `<tr><td style="color:#5b6660;padding:3px 0;">${li.label}<span style="float:right;color:#1f2421;">${centsToLabel(li.amountCents)}</span></td></tr>`,
        )
        .join("")}
      <tr><td style="border-top:1px solid #dedad0;padding-top:10px;margin-top:6px;font-weight:700;">Estimated total<span style="float:right;">${centsToLabel(input.totalCents)}</span></td></tr>
    </table>
    <p style="margin:0;color:#5b6660;">We'll let you know as soon as a provider is on the way.</p>
  `);

  return { subject, html, text };
}

export interface DeliveryCompleteEmailInput {
  totalCents: number;
  deliveryMethod: string;
}

export function deliveryCompleteEmail(input: DeliveryCompleteEmailInput): { subject: string; html: string; text: string } {
  const subject = "Your Laandry is home";

  const text = [
    `Delivered and verified just now (${input.deliveryMethod}).`,
    "",
    `Final total: ${centsToLabel(input.totalCents)}`,
    "",
    "How'd we do? Leave a tip or a rating from your order page.",
    "",
    "— Laandry",
  ].join("\n");

  const html = wrap(`
    <p style="margin:0 0 16px;">Delivered and verified just now.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dedad0;border-radius:10px;padding:16px;margin-bottom:16px;">
      <tr><td style="font-weight:700;">Final total<span style="float:right;">${centsToLabel(input.totalCents)}</span></td></tr>
    </table>
    <p style="margin:0;color:#5b6660;">How'd we do? Leave a tip or a rating from your order page.</p>
  `);

  return { subject, html, text };
}

export function providerApprovedEmail(): { subject: string; html: string; text: string } {
  const subject = "You're approved to go active";

  const text = [
    "Your Laandry provider application was approved.",
    "",
    "Next: add your availability and switch to Active to start receiving offers.",
    "",
    "— Laandry",
  ].join("\n");

  const html = wrap(`
    <p style="margin:0 0 16px;">Your Laandry provider application was approved.</p>
    <p style="margin:0;color:#5b6660;">Next: add your availability and switch to Active to start receiving offers.</p>
  `);

  return { subject, html, text };
}
