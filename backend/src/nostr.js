// Jàngal — Nostr receipts + embedded relay.
// Every settled fee is signed by the school's Nostr key (kind 30078,
// application-specific data) and broadcast over our self-hosted relay.
// No external dependency: the demo runs fully offline in docker compose.

import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, nip19 } from "nostr-tools";
import { db, q } from "./db.js";
import crypto from "node:crypto";

// In-memory event store for the embedded relay (receipts are also in SQLite)
const relayEvents = [];
const subscribers = new Map(); // ws -> Set(subId)

export function newSchoolNostrKeys() {
  const sk = generateSecretKey();
  return { pubkey: getPublicKey(sk), privkeyHex: Buffer.from(sk).toString("hex") };
}

export function signReceiptEvent(school, fee, student, preimageless = true) {
  const sk = Uint8Array.from(Buffer.from(school.nostr_privkey, "hex"));
  const receipt = {
    v: 1,
    app: "jangal",
    feeId: fee.id,
    school: school.name,
    schoolNpub: nip19.npubEncode(school.nostr_pubkey),
    student: maskName(student.name),              // initials only — no PII
    classLevel: fee.class_level,
    term: fee.term,
    amountXof: fee.amount_xof,
    amountSat: fee.amount_sat,
    paymentHash: fee.r_hash,
    settledAt: new Date().toISOString(),
  };
  const event = finalizeEvent(
    {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "jangal"],
        ["t", "school-fees"],
        ["d", fee.id],
        ["payment_hash", fee.r_hash],
      ],
      content: JSON.stringify(receipt),
    },
    sk
  );
  return event;
}

function maskName(name) {
  return name
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + "." : ""))
    .join(" ");
}

export function verifyReceiptEvent(event) {
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

export function publishEvent(event) {
  relayEvents.push(event);
  for (const [ws, subs] of subscribers) {
    if (ws.readyState === 1) {
      for (const subId of subs) {
        if (matchesFilter(event, ws._filters?.get(subId))) {
          ws.send(JSON.stringify(["EVENT", subId, event]));
        }
      }
    }
  }
}

// ------------------------- minimal relay ------------------------------- //
export function attachRelay(fastify) {
  fastify.get("/nostr", { websocket: true }, (socket) => {
    const filters = new Map(); // subId -> filter
    subscribers.set(socket, new Set());
    socket._filters = filters;

    socket.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const [type] = msg;
      if (type === "EVENT") {
        const event = msg[1];
        const ok = event && verifyReceiptEvent(event);
        if (ok) {
          publishEvent(event);
        }
        socket.send(JSON.stringify(["OK", event?.id ?? "?", !!ok, ok ? "" : "invalid: signature check failed"]));
      } else if (type === "REQ") {
        const subId = msg[1];
        const filter = msg[2] ?? {};
        filters.set(subId, filter);
        subscribers.get(socket).add(subId);
        const matched = relayEvents.filter((e) => matchesFilter(e, filter)).slice(-(filter.limit ?? 50));
        for (const e of matched) socket.send(JSON.stringify(["EVENT", subId, e]));
        socket.send(JSON.stringify(["EOSE", subId]));
      } else if (type === "CLOSE") {
        const subId = msg[1];
        filters.delete(subId);
        subscribers.get(socket)?.delete(subId);
      }
    });

    socket.on("close", () => subscribers.delete(socket));
  });
}

function matchesFilter(event, filter) {
  if (!filter) return false;
  if (filter.ids && !filter.ids.some((id) => event.id.startsWith(id))) return false;
  if (filter.authors && !filter.authors.some((a) => event.pubkey.startsWith(a))) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter["#t"] && !event.tags.some(([k, v]) => k === "t" && filter["#t"].includes(v))) return false;
  if (filter["#d"] && !event.tags.some(([k, v]) => k === "d" && filter["#d"].includes(v))) return false;
  return true;
}

// ------------------------- receipts ----------------------------------- //
export function storeReceipt(fee, event) {
  const id = crypto.randomBytes(6).toString("hex");
  q.insertReceipt.run(id, fee.id, event.id, JSON.stringify(event));
  publishEvent(event);
}
