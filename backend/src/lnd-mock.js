// LND mock — full state-machine simulation for UI development and smoke
// tests without Lightning nodes (LND_MODE=mock). Mirrors the hold-invoice
// lifecycle: OPEN -> ACCEPTED (locked) -> SETTLED | CANCELED.
import crypto from "node:crypto";

const hashOfHex = (preimageHex) =>
  crypto.createHash("sha256").update(Buffer.from(preimageHex, "hex")).digest("hex");

// invoices are shared across mock nodes — like a real Lightning network,
// the payer's node can pay an invoice created on the payee's node
const sharedInvoices = new Map(); // hashHex -> {state, amountSat, payment_request, memo}

function makeMock(name, opts) {
  const invoices = sharedInvoices;
  const state = { balanceSat: opts.startBalanceSat ?? 0 };

  const api = {
    name,
    __mock: true,
    async getInfo() { return { identity_pubkey: "mock" + name, alias: name, synced_to_chain: true }; },
    async initWallet() { return {}; },
    async waitReady() { return api.getInfo(); },
    async newAddress() { return { address: "bcrt1mock" + crypto.randomBytes(8).toString("hex") }; },
    async channelBalance() { return state.balanceSat; },
    async walletBalance() { return state.balanceSat; },
    async addHodlInvoice({ memo, amountSat, hashHex }) {
      const payment_request = "lnbcrtMOCK" + hashHex.slice(0, 24) + "x" + amountSat;
      invoices.set(hashHex, { state: "OPEN", amountSat, payment_request, memo });
      return { r_hash: hashHex, payment_request, add_index: invoices.size };
    },
    async invoice(hashHex) {
      const inv = invoices.get(hashHex);
      if (!inv) throw new Error("mock: invoice not found");
      return { state: inv.state, r_hash: hashHex };
    },
    async settleInvoice(preimageHex) {
      const hashHex = hashOfHex(preimageHex);
      const inv = invoices.get(hashHex);
      if (!inv) throw new Error("mock: unknown preimage");
      if (inv.state !== "ACCEPTED") throw new Error("mock: invoice not accepted");
      inv.state = "SETTLED";
      if (name === "lnd-school") state.balanceSat += inv.amountSat;
      return {};
    },
    async cancelInvoice(hashHex) {
      const inv = invoices.get(hashHex);
      if (!inv) return {};
      if (inv.state === "SETTLED") throw new Error("mock: already settled");
      inv.state = "CANCELED";
      return {};
    },
    sendPayment({ paymentRequest, onUpdate }) {
      // find the invoice this request belongs to (mock encoding carries the hash)
      const inv = [...invoices.values()].find((i) => i.payment_request === paymentRequest);
      if (!inv) return Promise.reject(new Error("mock: unknown payment request"));
      const hashHex = [...invoices.keys()].find((k) => invoices.get(k) === inv);
      return new Promise((resolve) => {
        setTimeout(() => {
          if (inv.state === "OPEN") {
            inv.state = "ACCEPTED";
            if (name === "lnd-parent") state.balanceSat -= inv.amountSat;
            onUpdate?.({ status: "IN_FLIGHT" });
          }
          const poll = setInterval(() => {
            if (inv.state === "SETTLED") {
              clearInterval(poll);
              onUpdate?.({ status: "SUCCEEDED" });
              resolve("succeeded");
            } else if (inv.state === "CANCELED") {
              clearInterval(poll);
              if (name === "lnd-parent") state.balanceSat += inv.amountSat; // refund
              onUpdate?.({ status: "FAILED", failure_reason: "canceled" });
              resolve("failed");
            }
          }, 300);
          // stream timeout guard (long demo horizon)
          setTimeout(() => clearInterval(poll), 3600_000);
        }, 250);
      });
    },
    async connectPeer() { return {}; },
    async listPeers() { return { peers: [] }; },
    async openChannel() { return { chan_pending: {} }; },
    async listChannels() { return { channels: [] }; },
  };
  return api;
}

export const mockLndSchool = makeMock("lnd-school", { startBalanceSat: 0 });
export const mockLndParent = makeMock("lnd-parent", { startBalanceSat: 10_000_000 });
