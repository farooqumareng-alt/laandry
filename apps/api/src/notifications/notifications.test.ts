import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryNotificationProvider } from "./memory-provider";
import { deliveryCompleteEmail, orderScheduledEmail, providerApprovedEmail } from "./templates";

test("orderScheduledEmail includes the pickup window, service, line items, and total", () => {
  const email = orderScheduledEmail({
    service: "FORMAL_SPECIAL_CARE",
    pickupWindowStart: new Date("2026-01-05T17:00:00.000Z"),
    pickupWindowEnd: new Date("2026-01-05T19:00:00.000Z"),
    lineItems: [{ label: "Shirt", amountCents: 500 }],
    totalCents: 500,
  });
  assert.equal(email.subject, "Your Laandry is scheduled");
  assert.match(email.text, /Formal & Special Care/);
  assert.match(email.text, /Shirt: \$5\.00/);
  assert.match(email.text, /Estimated total: \$5\.00/);
  assert.match(email.html, /Shirt/);
  assert.match(email.html, /\$5\.00/);
});

test("deliveryCompleteEmail includes the final total and delivery method", () => {
  const email = deliveryCompleteEmail({ totalCents: 6000, deliveryMethod: "signature" });
  assert.equal(email.subject, "Your Laandry is home");
  assert.match(email.text, /signature/);
  assert.match(email.text, /\$60\.00/);
  assert.match(email.html, /\$60\.00/);
});

test("providerApprovedEmail is a stable, static template", () => {
  const email = providerApprovedEmail();
  assert.equal(email.subject, "You're approved to go active");
  assert.match(email.text, /approved/);
});

test("InMemoryNotificationProvider records every send instead of making a real call", async () => {
  const provider = new InMemoryNotificationProvider();
  const result = await provider.sendEmail({ to: "customer@example.com", subject: "Test", html: "<p>hi</p>", text: "hi" });
  assert.ok(result.id);
  assert.equal(provider.sentEmails.length, 1);
  assert.equal(provider.sentEmails[0]?.to, "customer@example.com");
});
