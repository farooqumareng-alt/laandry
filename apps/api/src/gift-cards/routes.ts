import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { hasPermission, purchaseGiftCardSchema, redeemGiftCardSchema } from "@laandry/domain";

import { requireAuth, requireRole } from "../auth/plugin";
import type { AuthRepository } from "../auth/repository";
import type { CustomerRepository } from "../customer/repository";
import type { Env } from "../env";
import { giftCardPurchasedEmail } from "../notifications/templates";
import type { NotificationProvider } from "../notifications/provider";
import type { PaymentProvider } from "../payments/provider";
import type { ReferralsRepository } from "../referrals/repository";
import type { GiftCardsRepository } from "./repository";

export interface GiftCardsRoutesDeps {
  giftCardsRepository: GiftCardsRepository;
  referralsRepository: ReferralsRepository;
  customerRepository: CustomerRepository;
  authRepository: AuthRepository;
  paymentProvider: PaymentProvider;
  notificationProvider: NotificationProvider;
  env: Env;
}

/** Same 8-char scheme customer/repository.ts already uses for referral codes — collision-retried since, unlike a referral code, a gift card code isn't 1:1 with a profile. */
async function generateUniqueCode(giftCardsRepository: GiftCardsRepository): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    if (!(await giftCardsRepository.getGiftCardByCode(code))) return code;
  }
  throw new Error("Could not generate a unique gift card code after 5 attempts");
}

/**
 * Gift cards — docs/ARCHITECTURE.md §34, the last of Phase 11's three
 * named pieces. Purchasing charges the buyer immediately (no "balance
 * due later" concept — same authorize-and-book shape order/routes.ts
 * uses) and mints a code; redeeming a code mints a single
 * AccountCreditLedger grant for the full face value (reason
 * "gift_card_redeemed") and flips the card to REDEEMED — see
 * gift-cards.ts's domain comment for why that's the whole mechanism,
 * with no separate partial-balance tracking here at all. Reuses the
 * existing any-scoped order/read grant for admin visibility, same as
 * referrals/routes.ts's GET /admin/referrals.
 */
export function giftCardsRoutes(app: FastifyInstance, deps: GiftCardsRoutesDeps) {
  const { giftCardsRepository, referralsRepository, customerRepository, authRepository, paymentProvider, notificationProvider, env } = deps;
  const auth = requireAuth(env.JWT_SECRET);
  const asCustomer = [auth, requireRole("customer")];

  app.post("/gift-cards/purchase", { preHandler: asCustomer }, async (request, reply) => {
    const body = purchaseGiftCardSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });

    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });

    const authorization = await paymentProvider.authorize({
      customerId: profile.id,
      amountCents: body.data.valueCents,
      paymentMethodToken: body.data.paymentMethodToken,
    });
    if (authorization.status === "declined") {
      return reply.code(402).send({ error: "PAYMENT_DECLINED" });
    }

    const code = await generateUniqueCode(giftCardsRepository);
    const giftCard = await giftCardsRepository.createGiftCard({
      code,
      valueCents: body.data.valueCents,
      purchaserId: profile.id,
      recipientEmail: body.data.recipientEmail,
    });

    // Best-effort, same discipline as every other post-charge side effect
    // in this codebase: the charge already succeeded, so a failed email
    // never reverts or fails the purchase — the code is still visible in
    // GET /me/gift-cards either way.
    try {
      const purchaser = await authRepository.findUserById(request.authUser!.id);
      const isForRecipient = !!body.data.recipientEmail && body.data.recipientEmail !== purchaser?.email;
      const to = body.data.recipientEmail ?? purchaser?.email;
      if (to) {
        await notificationProvider.sendEmail({
          to,
          ...giftCardPurchasedEmail({ code: giftCard.code, valueCents: giftCard.valueCents, isForRecipient }),
        });
      }
    } catch (err) {
      request.log.error({ err, giftCardId: giftCard.id }, "gift-card-purchased email failed");
    }

    return reply.code(201).send({ giftCard });
  });

  app.post("/gift-cards/redeem", { preHandler: asCustomer }, async (request, reply) => {
    const body = redeemGiftCardSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT", details: body.error.flatten() });

    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });

    const giftCard = await giftCardsRepository.getGiftCardByCode(body.data.code.toUpperCase());
    if (!giftCard) return reply.code(404).send({ error: "GIFT_CARD_NOT_FOUND" });
    if (giftCard.status !== "UNREDEEMED") return reply.code(409).send({ error: "GIFT_CARD_ALREADY_REDEEMED" });

    // Unlike the best-effort side effects elsewhere in this codebase
    // (an email, a redemption record after an already-successful
    // charge), minting the credit here IS the point of this endpoint —
    // not wrapped in try/catch, so a failure surfaces as a real 500
    // instead of silently telling the customer their card was redeemed
    // for nothing.
    const redeemed = await giftCardsRepository.redeemGiftCard(giftCard.id, profile.id);
    await referralsRepository.addCreditEntry({
      customerId: profile.id,
      amountCents: redeemed.valueCents,
      reason: "gift_card_redeemed",
    });

    return reply.send({ giftCard: redeemed });
  });

  app.get("/me/gift-cards", { preHandler: asCustomer }, async (request, reply) => {
    const profile = await customerRepository.getProfileByUserId(request.authUser!.id);
    if (!profile) return reply.code(404).send({ error: "CUSTOMER_PROFILE_NOT_FOUND" });

    const giftCards = await giftCardsRepository.listPurchasedByCustomer(profile.id);
    return reply.send({ giftCards });
  });

  app.get("/admin/gift-cards", { preHandler: [auth] }, async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "order", "read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const giftCards = await giftCardsRepository.listAllGiftCards();
    return reply.send({ giftCards });
  });
}
