import type { IncomingMessage, ServerResponse } from "node:http";

import { buildApp } from "../src/app";
import { loadEnv } from "../src/env";

/**
 * Vercel serverless entry point. index.ts (the local-dev entry, via
 * app.listen()) and this file are the only two places buildApp() is
 * actually invoked outside tests — everything else (routing, auth,
 * business logic) is identical between "npm run dev" and this deployment.
 *
 * Built once per warm lambda container, not per request — buildApp() and
 * the Prisma singleton it wires up (see ../src/db.ts) are reused across
 * invocations exactly the way a long-running server reuses them, so this
 * doesn't reopen a fresh DB connection on every request.
 */
const env = loadEnv();
const app = buildApp(env);
const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  app.server.emit("request", req, res);
}
