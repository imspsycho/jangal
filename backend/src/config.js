// Jàngal — runtime configuration (environment-driven, sane defaults)
import path from "node:path";

const env = (k, d = "") => process.env[k] ?? d;

export const config = {
  port: Number(env("PORT", "3000")),
  nodeEnv: env("NODE_ENV", "production"),
  isProd: env("NODE_ENV", "production") === "production",

  lnd: {
    school: {
      rest: env("LND_SCHOOL_REST", "https://lnd-school:8080"),
    },
    parent: {
      rest: env("LND_PARENT_REST", "https://lnd-parent:8080"),
    },
    walletPassword: env("LND_WALLET_PASSWORD", "jangaldemo"),
    channelAmountSat: Number(env("CHANNEL_AMOUNT_SAT", "10000000")),
  },

  bitcoind: {
    host: env("BITCOIND_HOST", "bitcoind"),
    port: env("BITCOIND_RPCPORT", "18443"),
    user: env("BITCOIND_RPCUSER", "jangal"),
    pass: env("BITCOIND_RPCPASS", "jangal"),
  },

  rate: {
    // 1 satoshi ≈ RATE_XOF_PER_SAT CFA francs.
    // Derivation in docs/impact.md. Demo value, regtest.
    xofPerSat: Number(env("RATE_XOF_PER_SAT", "0.85")),
  },

  fees: {
    expirySeconds: Number(env("FEE_EXPIRY_SECONDS", "3600")),
  },

  ai: {
    provider: env("AI_PROVIDER", "mock"), // mock | openai-compatible
    baseUrl: env("AI_BASE_URL", ""),
    model: env("AI_MODEL", "glm-4-flash"),
    apiKey: env("AI_API_KEY", ""),
    timeoutMs: Number(env("AI_TIMEOUT_MS", "20000")),
  },

  jwtSecret: env("JWT_SECRET", "jangal-demo-secret-change-me"),
  seedOnBoot: env("SEED_ON_BOOT", "1") === "1",

  dataDir: env("DATA_DIR", path.resolve(process.cwd(), "data")),
  dbFile: path.resolve(env("DATA_DIR", path.resolve(process.cwd(), "data")), "jangal.db"),
};
