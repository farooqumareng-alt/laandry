import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok" as const,
    service: "@laandry/api",
    time: new Date().toISOString(),
  }));
}
