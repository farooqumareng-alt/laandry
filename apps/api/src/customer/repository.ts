import type { LaandryPreferences } from "@laandry/domain";

/**
 * Same pattern as apps/api/src/auth/repository.ts — an interface with an
 * in-memory implementation for tests and a Prisma-backed one for real, so
 * the customer-onboarding test suite needs no live Postgres either.
 */

export interface CustomerProfileRecord {
  id: string;
  userId: string;
  preferences: LaandryPreferences;
  preferredProviderId: string | null;
  referralCode: string | null;
}

export interface AddressRecord {
  id: string;
  customerId: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
}

export interface CreateAddressInput {
  customerId: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  lat?: number;
  lng?: number;
}

export interface CustomerRepository {
  /** Idempotent-in-spirit: called once, right after a customer user is created. */
  createProfile(userId: string): Promise<CustomerProfileRecord>;
  getProfileByUserId(userId: string): Promise<CustomerProfileRecord | null>;
  /** The reverse lookup — an Order only carries the CustomerProfile id, not the userId, so anything needing that customer's email (e.g. notifications) needs this first. */
  getProfileById(id: string): Promise<CustomerProfileRecord | null>;
  updatePreferences(profileId: string, preferences: LaandryPreferences): Promise<CustomerProfileRecord>;

  /** Lazy — most customers never look at their referral code, so it's generated on first GET /me/referral-code, not at registration. Idempotent: a profile that already has one just returns it. */
  getOrCreateReferralCode(profileId: string): Promise<string>;
  getProfileByReferralCode(code: string): Promise<CustomerProfileRecord | null>;

  addAddress(input: CreateAddressInput): Promise<AddressRecord>;
  listAddresses(customerId: string): Promise<AddressRecord[]>;
  getAddress(id: string): Promise<AddressRecord | null>;
  updateAddress(id: string, patch: Partial<CreateAddressInput>): Promise<AddressRecord>;
  deleteAddress(id: string): Promise<void>;
}
