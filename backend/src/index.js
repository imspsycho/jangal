// Jàngal — server entrypoint.
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { attachRelay } from "./nostr.js";
import { registerRoutes } from "./routes/api.js";
import { seed } from "./seed.js";
import { db, q } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 64 * 1024,
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // inline styles for tiny UI accents
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
});
await app.register(rateLimit, { global: true, max: 240, timeWindow: "1 minute" });
await app.register(cookie);
await app.register(websocket);

// embedded Nostr relay (wss://<host>/nostr) — receipts without 3rd parties
attachRelay(app);

// API
registerRoutes(app);

// health
app.get("/api/health", async () => ({ ok: true, app: "jangal", version: "1.0.0" }));

// ---------------- static frontend (SPA) ----------------
const publicDir = path.resolve(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html", publicDir);
  });
} else {
  app.get("/", async () => ({ app: "jangal", note: "frontend not built; API only" }));
}

// ---------------- boot ----------------
const start = async () => {
  try {
    if (config.seedOnBoot) {
      await seed().catch((e) => app.log.error(`seed failed: ${e.message}`));
    }
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`Jàngal listening on :${config.port} (regtest demo)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
