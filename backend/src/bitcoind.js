// Jàngal — bitcoind JSON-RPC client (regtest: mining for confirmations)
import http from "node:http";
import { config } from "./config.js";

let id = 0;

export function rpc(method, ...params) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: "1.0", id: ++id, method, params });
    const req = http.request(
      {
        hostname: config.bitcoind.host,
        port: config.bitcoind.port,
        path: "/",
        method: "POST",
        auth: `${config.bitcoind.user}:${config.bitcoind.pass}`,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (body.error) reject(new Error(`bitcoind ${method}: ${body.error.message}`));
            else resolve(body.result);
          } catch (e) { reject(e); }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("bitcoind request timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export async function mine(blocks, address) {
  return rpc("generatetoaddress", blocks, address);
}

export async function waitForBitcoind(timeoutMs = 120000) {
  const start = Date.now();
  for (;;) {
    try {
      await rpc("getblockchaininfo");
      return true;
    } catch { /* retry */ }
    if (Date.now() - start > timeoutMs) throw new Error("bitcoind not ready");
    await new Promise((r) => setTimeout(r, 1500));
  }
}
