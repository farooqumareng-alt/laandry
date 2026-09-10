import type { PromotionRecord, PromotionsRepository } from "./repository";

export const PROMO_VALIDATION_ERRORS = [
  "PROMO_NOT_FOUND",
  "PROMO_INACTIVE",
  "PROMO_NOT_YET_ACTIVE",
  "PROMO_EXPIRED",
  "PROMO_MAX_REDEMPTIONS_REACHED",
  "PROMO_ALREADY_USED_BY_CUSTOMER",
] as const;
export type PromoValidationError = (typeof PROMO_VALIDATION_ERRORS)[number];

/**
 * The one place every "is this code actually usable, right now, by this
 * customer" check lives — both order/routes.ts's quote-preview and the
 * real booking call this, so a promo that previews as valid can never
 * turn out invalid only at the moment of actually charging for it (the
 * reverse — valid at booking but not at preview — isn't possible either,
 * since this is the only path either one uses).
 */
export async function validatePromotion(
  repo: PromotionsRepository,
  rawCode: string,
  customerId: string,
): Promise<{ promotion: PromotionRecord } | { error: PromoValidationError }> {
  const promotion = await repo.getPromotionByCode(rawCode.toUpperCase());
  if (!promotion) return { error: "PROMO_NOT_FOUND" };
  if (!promotion.active) return { error: "PROMO_INACTIVE" };

  const now = new Date();
  if (promotion.startsAt && now < promotion.startsAt) return { error: "PROMO_NOT_YET_ACTIVE" };
  if (promotion.endsAt && now > promotion.endsAt) return { error: "PROMO_EXPIRED" };

  if (promotion.maxRedemptions !== null) {
    const totalRedemptions = await repo.countRedemptionsForPromotion(promotion.id);
    if (totalRedemptions >= promotion.maxRedemptions) return { error: "PROMO_MAX_REDEMPTIONS_REACHED" };
  }

  const customerRedemptions = await repo.countRedemptionsForCustomer(promotion.id, customerId);
  if (customerRedemptions >= promotion.perCustomerLimit) return { error: "PROMO_ALREADY_USED_BY_CUSTOMER" };

  return { promotion };
}
