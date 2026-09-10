import type {
  AddressInput,
  BookingServiceInput,
  ComputedQuote,
  IncidentStatus,
  IncidentType,
  LaandryPreferences,
  OrderStatus,
  ProcessingStage,
  ProviderStatus,
  Role,
  ServiceType,
} from "@laandry/domain";

export interface LaandryClientOptions {
  baseUrl: string;
  /** Called per-request so a rotated/refreshed token is always used. */
  getAuthToken?: () => string | null | Promise<string | null>;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  time: string;
}

export interface AuthUserSummary {
  id: string;
  email: string;
  role: Role;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUserSummary;
  mfaSetupRequired?: boolean;
}

export interface MeResponse extends AuthUserSummary {
  mfaEnabled: boolean;
}

export interface Address {
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

export interface CustomerProfileResponse {
  preferences: LaandryPreferences;
  preferredProviderId: string | null;
  addresses: Address[];
}

export interface OrderItem {
  description: string;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: string;
  addressId: string;
  service: ServiceType;
  status: OrderStatus;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  preferenceSnapshot: LaandryPreferences;
  items: OrderItem[];
  createdAt: string;
}

export interface QuoteResponse {
  id: string;
  orderId: string;
  version: number;
  estimatedWeightRangeLb: [number, number] | null;
  lineItems: ComputedQuote["lineItems"];
  subtotalCents: number;
  promoDiscountCents: number;
  totalCents: number;
  createdAt: string;
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  processorRef: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

export type BookingInput = BookingServiceInput & {
  addressId: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  paymentMethodToken: string;
  preferenceOverrides?: Partial<LaandryPreferences>;
};

export type QuotePreviewInput = BookingServiceInput & { preferenceOverrides?: Partial<LaandryPreferences> };

export interface ProviderProfileResponse {
  id: string;
  userId: string;
  status: ProviderStatus;
}

/** GET /admin/providers only — the same profile plus its capability list, joined server-side so an admin table doesn't need one request per row. */
export interface AdminProviderSummary extends ProviderProfileResponse {
  services: ServiceType[];
}

export interface ProviderCapability {
  id: string;
  providerId: string;
  service: ServiceType;
}

export interface ProviderServiceArea {
  id: string;
  providerId: string;
  postalPrefix: string;
  radiusMiles: number;
}

export interface ProviderAvailability {
  id: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
}

export interface ProviderOffer {
  id: string;
  orderId: string;
  providerId: string;
  status: "ELIGIBLE" | "WAVE_1_OFFERED" | "WAVE_2_OFFERED" | "ACCEPTED" | "UNFULFILLED";
  wave: number;
  offeredAt: string | null;
  respondedAt: string | null;
}

export interface ProviderOfferSummary {
  offer: ProviderOffer;
  service: ServiceType;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  approximateArea: string;
}

export interface ProviderAssignment {
  id: string;
  orderId: string;
  offerId: string;
  providerId: string;
  acceptedAt: string;
}

export interface PickupVerification {
  id: string;
  orderId: string;
  bagCount: number | null;
  itemCount: number | null;
  method: string;
  verifiedAt: string;
}

export interface WeightVerification {
  id: string;
  orderId: string;
  verifiedWeightLb: number;
  verifiedByUserId: string;
  requiredApproval: boolean;
  approvedByCustomer: boolean | null;
  createdAt: string;
}

export interface Incident {
  id: string;
  orderId: string;
  reportedByUserId: string;
  type: IncidentType;
  description: string;
  status: IncidentStatus;
  resolutionNote: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DeliveryVerification {
  id: string;
  orderId: string;
  method: string;
  verifiedAt: string;
}

export interface Tip {
  id: string;
  orderId: string;
  amountCents: number;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export class LaandryApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Laandry API error ${status}`);
    this.name = "LaandryApiError";
  }

  /** The API's machine-readable error code (e.g. "MFA_REQUIRED", "INVALID_CREDENTIALS"), when the response body carries one. */
  get code(): string | undefined {
    return typeof this.body === "object" && this.body !== null && "error" in this.body
      ? String((this.body as { error: unknown }).error)
      : undefined;
  }
}

/**
 * Thin typed client shared by apps/app and apps/admin. It never computes a
 * price or an order status itself — every response is exactly what the API
 * returned. See docs/ARCHITECTURE.md §7 ("price tampering").
 */
export function createLaandryClient(options: LaandryClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await options.getAuthToken?.();
    const res = await fetch(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        // Only set when there's actually a body — Fastify's JSON body
        // parser rejects an empty body when this header is present at
        // all ("Body cannot be empty when content-type is set to
        // 'application/json'"), which broke every no-payload POST call
        // (mfaEnroll, activateProvider, startDelivery, ...) over real
        // HTTP. Masked until Phase 10's live check because Fastify's
        // in-process test harness (app.inject()) doesn't enforce this
        // the same way a real fetch request does.
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      throw new LaandryApiError(res.status, body);
    }
    return body as T;
  }

  const post = <T>(path: string, payload?: unknown) =>
    request<T>(path, { method: "POST", body: payload !== undefined ? JSON.stringify(payload) : undefined });

  return {
    health: () => request<HealthResponse>("/health"),

    // --- auth ---
    register: (input: { email: string; password: string }) => post<Session>("/auth/register", input),
    login: (input: { email: string; password: string; mfaCode?: string }) => post<Session>("/auth/login", input),
    refresh: (refreshToken: string) => post<Session>("/auth/refresh", { refreshToken }),
    logout: (refreshToken: string) => post<void>("/auth/logout", { refreshToken }),
    me: () => request<MeResponse>("/me"),
    mfaEnroll: () => post<{ secret: string; otpauthUri: string }>("/auth/mfa/enroll"),
    mfaVerify: (code: string) => post<{ mfaEnabled: true }>("/auth/mfa/verify", { code }),

    // --- customer profile / preferences / addresses ---
    getProfile: () => request<CustomerProfileResponse>("/me/profile"),
    updatePreferences: (preferences: LaandryPreferences) =>
      request<{ preferences: LaandryPreferences }>("/me/preferences", {
        method: "PUT",
        body: JSON.stringify(preferences),
      }),
    listAddresses: () => request<{ addresses: Address[] }>("/me/addresses"),
    addAddress: (input: AddressInput) => post<{ address: Address }>("/me/addresses", input),
    updateAddress: (id: string, patch: Partial<AddressInput>) =>
      request<{ address: Address }>(`/me/addresses/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deleteAddress: (id: string) => request<void>(`/me/addresses/${id}`, { method: "DELETE" }),

    // --- booking / orders ---
    /** Preview-only — computes the same price booking will charge, without creating an order. */
    quotePreview: (input: QuotePreviewInput) => post<ComputedQuote>("/quote-preview", input),
    createOrder: (input: BookingInput) =>
      post<{ order: Order; quote: QuoteResponse; payment: PaymentResponse }>("/orders", input),
    listOrders: () => request<{ orders: Order[] }>("/orders"),
    getOrder: (id: string) => request<{ order: Order; quote: QuoteResponse | null }>(`/orders/${id}`),

    // --- provider onboarding ---
    applyAsProvider: (input: { email: string; password: string }) =>
      post<Session & { provider: ProviderProfileResponse }>("/provider/apply", input),
    getProviderProfile: () =>
      request<{
        profile: ProviderProfileResponse;
        capabilities: ProviderCapability[];
        serviceAreas: ProviderServiceArea[];
        availability: ProviderAvailability[];
      }>("/provider/me"),
    setProviderCapabilities: (services: ServiceType[]) =>
      request<{ capabilities: ProviderCapability[] }>("/provider/capabilities", {
        method: "PUT",
        body: JSON.stringify({ services }),
      }),
    addProviderServiceArea: (input: { postalPrefix: string; radiusMiles: number }) =>
      post<{ serviceArea: ProviderServiceArea }>("/provider/service-areas", input),
    removeProviderServiceArea: (id: string) => request<void>(`/provider/service-areas/${id}`, { method: "DELETE" }),
    addProviderAvailability: (input: { startsAt: string; endsAt: string }) =>
      post<{ availability: ProviderAvailability }>("/provider/availability", input),
    removeProviderAvailability: (id: string) => request<void>(`/provider/availability/${id}`, { method: "DELETE" }),
    submitProviderForReview: () => post<{ profile: ProviderProfileResponse }>("/provider/submit-for-review"),
    activateProvider: () => post<{ profile: ProviderProfileResponse }>("/provider/activate"),

    // --- matching / offers ---
    listProviderOffers: () => request<{ offers: ProviderOfferSummary[] }>("/provider/offers"),
    /** 409 (thrown as LaandryApiError, code "OFFER_NO_LONGER_AVAILABLE") means someone else already won it — always a real possibility, never treat it as a bug. */
    acceptOffer: (offerId: string) => post<{ assignment: ProviderAssignment }>(`/provider/offers/${offerId}/accept`),
    /** Exact address only resolves once this provider is the assigned one for this order — see docs/ARCHITECTURE.md §11. */
    getProviderOrder: (orderId: string) => request<{ order: Order; address: Address }>(`/provider/orders/${orderId}`),

    // --- pickup / weight verification ---
    recordPickup: (orderId: string, input: { bagCount?: number; itemCount?: number; method: "qr" | "pin" | "signature" }) =>
      post<{ order: Order }>(`/provider/orders/${orderId}/pickup`, input),
    verifyWeight: (orderId: string, verifiedWeightLb: number) =>
      post<{ order: Order; weightVerification: WeightVerification }>(`/provider/orders/${orderId}/verify-weight`, {
        verifiedWeightLb,
      }),
    getWeightVerification: (orderId: string) =>
      request<{ weightVerification: WeightVerification | null }>(`/orders/${orderId}/weight-verification`),
    /** 402 (LaandryApiError code "PAYMENT_DECLINED") means the additional charge for the overage was declined — the order stays PICKED_UP, try again with a different token. */
    approveWeight: (orderId: string, paymentMethodToken: string) =>
      post<{ order: Order; quote: QuoteResponse }>(`/orders/${orderId}/approve-weight`, { paymentMethodToken }),
    declineWeight: (orderId: string) => post<{ order: Order }>(`/orders/${orderId}/decline-weight`),

    // --- processing / incidents ---
    /** 400 (LaandryApiError code "INCOMPLETE_STAGE_CONFIRMATION") carries `requiredStages` in the body so the UI can show exactly what's missing. */
    confirmProcessing: (orderId: string, confirmedStages: ProcessingStage[]) =>
      post<{ order: Order }>(`/provider/orders/${orderId}/confirm-processing`, { confirmedStages }),
    markReadyForReturn: (orderId: string) =>
      post<{ order: Order; openIncidentCount: number }>(`/provider/orders/${orderId}/ready-for-return`),
    reportIncident: (orderId: string, input: { type: IncidentType; description: string }) =>
      post<{ incident: Incident }>(`/provider/orders/${orderId}/incidents`, input),
    listIncidents: (orderId: string) => request<{ incidents: Incident[] }>(`/orders/${orderId}/incidents`),
    resolveIncident: (orderId: string, incidentId: string, resolutionNote: string) =>
      post<{ incident: Incident }>(`/orders/${orderId}/incidents/${incidentId}/resolve`, { resolutionNote }),

    // --- return delivery / proof of delivery / tips / review ---
    startDelivery: (orderId: string) => post<{ order: Order }>(`/provider/orders/${orderId}/start-delivery`),
    completeDelivery: (orderId: string, method: "qr" | "pin" | "signature") =>
      post<{ order: Order; deliveryVerification: DeliveryVerification }>(`/provider/orders/${orderId}/complete-delivery`, {
        method,
      }),
    reportDeliveryFailed: (orderId: string, reason?: string) =>
      post<{ order: Order; reason: string | null }>(`/provider/orders/${orderId}/delivery-failed`, { reason }),
    retryDelivery: (orderId: string) => post<{ order: Order }>(`/provider/orders/${orderId}/retry-delivery`),
    getDeliveryVerification: (orderId: string) =>
      request<{ deliveryVerification: DeliveryVerification | null }>(`/orders/${orderId}/delivery-verification`),
    /** 402 (LaandryApiError code "PAYMENT_DECLINED") means the charge failed — no tip is recorded, try again with a different token. A second, later tip on the same order is legitimate — each call is its own ledger entry. */
    addTip: (orderId: string, amountCents: number, paymentMethodToken: string) =>
      post<{ tip: Tip }>(`/orders/${orderId}/tip`, { amountCents, paymentMethodToken }),
    listTips: (orderId: string) => request<{ tips: Tip[] }>(`/orders/${orderId}/tips`),
    /** 409 (LaandryApiError code "REVIEW_ALREADY_SUBMITTED") means this order already has one — there's no edit endpoint yet. */
    submitReview: (orderId: string, input: { rating: number; comment?: string }) =>
      post<{ review: Review }>(`/orders/${orderId}/review`, input),
    getReview: (orderId: string) => request<{ review: Review | null }>(`/orders/${orderId}/review`),

    // --- admin console (Phase 10) — staff-only; each 403s for a customer or provider token ---
    adminListOrders: (status?: OrderStatus) =>
      request<{ orders: Order[] }>(`/admin/orders${status ? `?status=${status}` : ""}`),
    adminListProviders: (status?: ProviderStatus) =>
      request<{ providers: AdminProviderSummary[] }>(`/admin/providers${status ? `?status=${status}` : ""}`),
    adminApproveProvider: (providerId: string) =>
      post<{ profile: ProviderProfileResponse }>(`/admin/providers/${providerId}/approve`),
    adminListIncidents: (status?: IncidentStatus) =>
      request<{ incidents: Incident[] }>(`/admin/incidents${status ? `?status=${status}` : ""}`),
    adminListReviews: () => request<{ reviews: Review[] }>("/admin/reviews"),
  };
}

export type LaandryClient = ReturnType<typeof createLaandryClient>;
