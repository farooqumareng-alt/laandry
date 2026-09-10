/**
 * Local-dev-only seed: creates one admin account so you can exercise
 * staff-gated endpoints (e.g. POST /admin/providers/:id/approve) without
 * building an admin-invite flow first. Staff accounts are never created
 * through a public endpoint (see ../auth/routes.ts) — this is the
 * direct-DB equivalent of "an existing admin creates the account,"
 * standing in for that until Phase 10 has real staff management.
 *
 * Safe to re-run: skips creation if the account already exists. Excluded
 * from the production build (see ../../tsconfig.build.json) — this never
 * ships, it only runs via `npm run prisma:seed` against your local DB.
 */
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../auth/password";

const ADMIN_EMAIL = "admin@laandry.test";
const ADMIN_PASSWORD = "laandry-dev-admin-password";

async function main() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (existing) {
      console.log(`Seed: ${ADMIN_EMAIL} already exists — nothing to do.`);
      return;
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    await prisma.user.create({ data: { email: ADMIN_EMAIL, role: "ADMIN", passwordHash } });

    console.log("Seed: created a local dev admin account.");
    console.log(`  email:    ${ADMIN_EMAIL}`);
    console.log(`  password: ${ADMIN_PASSWORD}`);
    console.log("  (dev-only credentials — never use these outside a local database)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
