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
3. `/book` — walk the 4-step wizard (any service; payment token `tok_visa` authorizes, `tok_declined` simulates a decline)
4. `/orders` — see it listed with its milestone; `/orders/[id]` shows the tracker + priced line items

**Provider journey** — same app, different account
1. `/providers` — apply (this is a separate account from any customer login, sign out first if needed)
2. `/provider/onboarding` — pick capabilities, add a service area, submit for review
3. Approve it — there's no admin UI for this yet (Phase 10), so call the API directly:
   ```
   curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" \
     -d '{"email":"admin@laandry.test","password":"<password from prisma:seed output>"}'
   # copy accessToken from the response, then:
   curl -X POST http://localhost:4000/admin/providers/<providerId>/approve \
     -H "Authorization: Bearer <accessToken>"
   ```
   (`<providerId>` is in the response from step 2's submit-for-review, or `GET /provider/me`.)
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

Phases 0–6 done: repo scaffold/routing/design tokens/DB schema,
auth/roles/authorization test harness, customer onboarding (addresses +
preferences), booking/pricing/payment authorization, provider onboarding
(application → capabilities/service areas → review → approval →
availability → active), matching/offers/atomic acceptance, and a security
hardening pass (helmet, CORS allowlist, rate limiting, log redaction, a
non-leaking error handler) — front to back, 97 tests, `npm run test`. See
[docs/ARCHITECTURE.md §18](docs/ARCHITECTURE.md#18-phased-implementation-sequence)
for what's next and what gates it, §19–§23 for what Phases 2–6 shipped
(§23 walks through a real concurrency bug the Phase 6 gate test caught and
how it was fixed), and §24 for the security pass.
