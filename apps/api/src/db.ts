import { PrismaClient } from "@prisma/client";

// Constructed lazily so importing this module never requires DATABASE_URL
// to be set — the authorization test harness injects an in-memory
// repository and never calls getPrisma() at all. See app.ts.
let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}
