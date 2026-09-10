# Laandry

Foundational architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read
that first — nothing here should contradict it, and if it does, the doc is
what's wrong and should be fixed, not silently overridden by code.

## Layout

```
apps/
  app/     Expo Router — customer + provider, native + web (laandry.com, iOS, Android)
  admin/   Next.js — desktop-only ops console (admin.laandry.com)
  api/     Fastify + Prisma backend (api.laandry.com)
packages/
  domain/       Shared order/offer state machines, roles/permissions, quote types
  ui/            Shared design tokens
  api-client/   Typed client used by app + admin
infra/            docker-compose for local Postgres
docs/              Architecture and phase-sequence docs
```

## Setup

You need a running Postgres. Easiest is Docker Desktop
([docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop))
— once it's installed and running:

```
npm install          # also builds packages/* (postinstall)
docker compose -f infra/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env
cd apps/api && npx prisma migrate dev --name init
npm run prisma:seed  # creates one local dev admin account — see output for its password
cp ../app/.env.example ../app/.env    # EXPO_PUBLIC_API_URL, defaults to localhost:4000
```

Optionally, set `RESEND_API_KEY` in `apps/api/.env` to send real order/
delivery/provider-approval emails locally (see §30) — leave it unset
and the app records them in memory instead of sending, which is what
every automated test does regardless.

No Docker? Any Postgres 14+ works — install it natively, or use a free
hosted instance (e.g. [neon.com](https://neon.com),
[supabase.com](https://supabase.com)) and put its connection string in
`apps/api/.env` as `DATABASE_URL` instead of the docker-compose one.

## Run

```
npm run dev           # all three together, labeled/colored output
```
or individually, in separate terminals:
```
npm run dev:api        # http://localhost:4000
npm run dev:app        # Expo — press w for web, or scan the QR code with Expo Go
npm run dev:admin      # http://localhost:3000 (falls back to 3001+ if something else already owns 3000)
```

## Try it end to end

With all three running (web is the fastest way to click through — press
`w` in the `dev:app` terminal):

**Customer journey** — laandry.com (`http://localhost:8081` in dev)
1. `/register` — create an account
2. `/account` — add a saved address
3. `/book` — walk the 4-step wizard (any service; payment token `tok_visa` authorizes, `tok_declined` simulates a decline). Review has an optional promo code field — create one first at `/promotions` in the admin console (or `POST /admin/promotions`) to try it; "Apply" re-prices before you commit
4. `/orders` — see it listed with its milestone; `/orders/[id]` shows the tracker + priced line items
5. `/referrals` shows your real code and credit balance — to see the full loop, `/register` a second account with that code, walk *that* account's own order through to Delivered (see the provider journey below), then check the first account's `/referrals` again: credit should now show up, and the second account gets a "use my credit" toggle at its own next `/book` Review step

**Provider journey** — same app, different account
1. `/providers` — apply (this is a separate account from any customer login, sign out first if needed)
2. `/provider/onboarding` — pick capabilities, add a service area, submit for review
3. Approve it — `apps/admin` now has a real console for this (Phase 10):
   sign in at `http://localhost:3000/login` with `admin@laandry.test` /
   `<password from prisma:seed output>`, enroll MFA the first time
   (every staff role requires it — the console walks you through it),
   then **Provider Applications** → **Approve**. `<providerId>` in the
   URL matches the one from step 2's submit-for-review response, or
   `GET /provider/me`. (Raw `curl` still works the same way if you'd
   rather skip the UI — `POST /auth/login`, then
   `POST /admin/providers/<providerId>/approve` with the token — just
   note a fresh local DB's seeded admin has no MFA enrolled yet, so
   `/auth/login` succeeds directly with `mfaSetupRequired: true` until
   you call `/auth/mfa/enroll` + `/auth/mfa/verify` once.)
4. `/provider/availability` — add a shift, then "Go Active"
5. Have the *customer* account book an order (`/book`) whose service,
   address postal code, and pickup window all fall inside what you set up
   in steps 2 and 4 — matching is real, not simulated, so a mismatched
   service area or a shift that doesn't overlap the pickup window means no
   offer shows up. If it matches, `/provider/offers` shows it within a
   couple seconds of the booking completing (dispatch runs synchronously,
   no polling needed); Accept takes you to `/provider/orders/[id]` with the
   full address and care preferences, which weren't visible before you
   accepted.
6. Confirm pickup, then (for everyday laundry/travel) verify weight — see
   §26. Once the order reaches "Being Cared For," check off each required
   stage shown on `/provider/orders/[id]` (exactly the ones the
   customer's saved preferences call for — try leaving one unchecked and
   the button stays disabled) to move it to "Finishing," then "Mark Ready
   for Return." "Report an issue with this order" is available the whole
   time an order is in a provider's hands and never blocks either of
   those buttons — the customer sees it on `/orders/[id]` immediately,
   before anyone resolves it.
7. "Start Delivery" then "Confirm Delivered" (or "Delivery Failed" to see
   the retry path — "Try Delivery Again" puts it back on the way) — see
   §28. Once delivered, the *customer's* `/orders/[id]` shows a tip card
   (test token `tok_visa`/`tok_declined` work the same as at booking) and
   a star rating; a review can only be submitted once per order.

**Poking at the API directly** — every route in `docs/ARCHITECTURE.md` §21/§22
is plain JSON over HTTP; `curl` or any REST client works. `npx prisma studio`
(from `apps/api`) opens a browser UI over the actual database if you want
to see the rows land.

## Verify

```
npm run typecheck    # every workspace
npm run test         # every workspace with a test script — no live DB needed
npm run build        # every workspace with a build script
```

## Status

Phases 0–10 done: repo scaffold/routing/design tokens/DB schema,
auth/roles/authorization test harness, customer onboarding (addresses +
preferences), booking/pricing/payment authorization, provider onboarding
(application → capabilities/service areas → review → approval →
availability → active), matching/offers/atomic acceptance, pickup/weight
verification (with re-pricing on a verified overage), a security
hardening pass (helmet, CORS allowlist, rate limiting, log redaction, a
non-leaking error handler), the processing workflow (required-stage
confirmation against the customer's actual preferences, plus an
incident-reporting pathway that never blocks or gates the order), the
return-delivery leg (with a real failed-delivery/retry path, tips as
immutable ledger entries, and a one-shot post-delivery review), and a
real staff-authenticated admin console (MFA enrollment, live orders,
providers, provider applications with a working approve action, and
incident resolution), and — out of phase sequence, once real
credentials/decisions existed — real transactional email via Resend
(order-scheduled, delivery-complete, provider-approved) and real
provider earnings/payouts (a user-confirmed 30% platform / 70% provider
split, tips paid through at 100%, an admin-triggered payout batch
action). Phase 11 is mostly done: promo codes are real (percentage or
fixed-amount, redemption limits, applied at booking) and so is the
referral program (a real code per customer, credit granted to both
parties only once the referee's first order is delivered — never at
signup, and spendable at a future booking); gift cards are still
unbuilt, deliberately — front to back, 177 tests, `npm run test`. See
[docs/ARCHITECTURE.md §18](docs/ARCHITECTURE.md#18-phased-implementation-sequence)
for what's next and what gates it, §19–§23 and §26–§33 for what shipped
(§23 walks through a real concurrency bug the Phase 6 gate test caught
and how it was fixed; §29 walks through a real Content-Type/empty-body
bug its own live check caught, that had been silently breaking every
bodyless POST call — Go Active, Start Delivery, and the like — in the
live app; §30 covers the real email integration, §31 the earnings/
payouts ledger, §32 the promo-code engine — including a real
double-discount bug its own test caught before it ever reached a
route — and §33 the referral program), §24 for the security pass, and
§25 for the live deployment
(with three more real bugs deploying surfaced and fixed).

**Live:** `laandry.com` — the customer/provider app, on its real domain.
API at `api.laandry.com` (or `api-dusky-nine-29.vercel.app` if that
subdomain's DNS hasn't finished propagating), admin console at
`admin.laandry.com` (or `laandry-admin-farooqumars-projects.vercel.app`
— same DNS caveat; sign in with `admin@laandry.test` /
`laandry-dev-admin-password`, same as local dev — MFA-enrolled for real
as of Phase 10) — all on Vercel, backed by a real Supabase Postgres. See §25 for what's genuinely verified there vs. still
open (no real payment processor, native mobile isn't shipped anywhere).
