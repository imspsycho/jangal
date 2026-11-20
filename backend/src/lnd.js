// Jàngal — minimal LND REST client (hold-invoice escrow engine).
// Talks to LND over HTTPS REST with TLS verification disabled (self-signed
// container certs, isolated regtest network). Macaroons are disabled in the
// demo compose file; production must enable macaroon auth (threat model).

import https from "node:https";
import crypto from "node:crypto";

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function request(baseUrl, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        agent,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": payload.length } : {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* NDJSON or empty */ }
          if (res.statusCode >= 400) {
            const err = new Error(`LND ${method} ${path} -> ${res.statusCode}: ${text.slice(0, 300)}`);
            err.status = res.statusCode;
            err.body = json;
            reject(err);
          } else {
            resolve({ status: res.statusCode, json, text });
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("LND request timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Stream reader for SendPaymentV2 (responds with NDJSON progress updates).
function requestStream(baseUrl, method, path, body, onUpdate) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        agent,
        headers: { "Content-Type": "application/json", "Content-Length": payload.length },
      },
      (res) => {
        const chunks = [];
        let buffer = "";
        res.on("data", (c) => {
          chunks.push(c);
          buffer += c.toString("utf8");
          let idx;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;
            try { onUpdate?.(JSON.parse(line)); } catch { /* ignore */ }
          }
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 400) {
            reject(new Error(`LND stream ${path} -> ${res.statusCode}: ${text.slice(0, 300)}`));
          } else {
            resolve(text);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

function makeLnd(name, baseUrl) {
  const api = {
    name,
    async get(path) { return (await request(baseUrl, "GET", path)).json; },
    async post(path, body) { return (await request(baseUrl, "POST", path, body ?? {})).json; },

    async getInfo() { return api.get("/v1/getinfo"); },
    async initWallet(password) {
      try {
        return await api.post("/v1/initwallet", { wallet_password: b64(password) });
      } catch (e) {
        // already initialized -> unlock
        return api.post("/v1/unlockwallet", { wallet_password: b64(password) });
      }
    },
    async newAddress(type = "p2wkh") { return api.get(`/v1/newaddress?type=${type}`); },
    async channelBalance() {
      const r = await api.get("/v1/balance/channels");
      return Number(r.local_balance?.sat ?? 0);
    },
    async walletBalance() {
      const r = await api.get("/v1/balance/blockchain");
      return Number(r.confirmed_balance ?? 0);
    },

    // ---- hold-invoice escrow ------------------------------------------------
    async addHodlInvoice({ memo, amountSat, hashHex, expirySeconds }) {
      return api.post("/v1/invoices/hodl", {
        memo,
        value_msat: String(Math.round(amountSat * 1000)),
        hash: Buffer.from(hashHex, "hex").toString("base64"), // bytes field
        expiry: String(expirySeconds),
        private: true,
      });
    },
    async invoice(rHashHex) {
      return api.get(`/v1/invoice/${rHashHex}`);
    },
    async settleInvoice(preimageHex) {
      return api.post("/v1/invoices/settle-invoice", {
        preimage: Buffer.from(preimageHex, "hex").toString("base64"),
      });
    },
    async cancelInvoice(rHashHex) {
      return api.post("/v1/invoices/cancel", {
        payment_hash: Buffer.from(rHashHex, "hex").toString("base64"),
      });
    },

    // ---- payments ------------------------------------------------------------
    // Fire a payment; resolves when the stream ends (payment terminal) or, for
    // hold invoices, stays open while the HTLC is locked. onUpdate receives
    // payment status updates (IN_FLIGHT, SUCCEEDED, FAILED).
    sendPayment({ paymentRequest, timeoutSeconds = 3600, feeLimitSat = 5000, onUpdate }) {
      return requestStream(
        baseUrl, "POST", "/v2/router/send",
        {
          payment_request: paymentRequest,
          timeout_seconds: String(timeoutSeconds),
          fee_limit_sat: String(feeLimitSat),
        },
        onUpdate
      );
    },

    // ---- peering & channels ---------------------------------------------------
    async connectPeer(pubkey, host) {
      return api.post("/v1/peers", { addr: { pubkey, host }, perm: false }).catch((e) => {
        if (String(e.message).includes("already connected")) return {};
        throw e;
      });
    },
    async listPeers() { return api.get("/v1/peers"); },
    async openChannel({ pubkey, amountSat, targetConf = 2 }) {
      // returns pending channel info; caller mines confirmations after
      return api.post("/v1/channels", {
        node_pubkey_string: pubkey,
        local_funding_amount: String(amountSat),
        target_conf: targetConf,
        private: true,
        min_confs: 1,
      });
    },
    async listChannels() { return api.get("/v1/channels"); },

    // wait until getinfo works (node ready)
    async waitReady(timeoutMs = 120000) {
      const start = Date.now();
      for (;;) {
        try {
          const info = await api.getInfo();
          if (info?.identity_pubkey) return info;
        } catch { /* not up yet */ }
        if (Date.now() - start > timeoutMs) throw new Error(`${name} not ready after ${timeoutMs}ms`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    },
  };
  return api;
}

import { mockLndSchool, mockLndParent } from "./lnd-mock.js";

const LND_MODE = process.env.LND_MODE || "live"; // live | mock

export const lndSchool = LND_MODE === "mock" ? mockLndSchool : makeLnd("lnd-school", process.env.LND_SCHOOL_REST || "https://lnd-school:8080");
export const lndParent = LND_MODE === "mock" ? mockLndParent : makeLnd("lnd-parent", process.env.LND_PARENT_REST || "https://lnd-parent:8080");

export const newPreimage = () => crypto.randomBytes(32).toString("hex");
export const hashOf = (preimageHex) => crypto.createHash("sha256").update(Buffer.from(preimageHex, "hex")).digest("hex");
