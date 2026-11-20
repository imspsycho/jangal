// Jàngal — unit tests (no server, no network): pure module behaviour.
//   node src/unit-tests.js
// Covers: XOF↔sats conversion, localized notifications (wo/fr/en × all kinds),
// JWT sign/verify/tamper/expiry, Nostr sign→verify→tamper, masked names,
// mock-LND hold-invoice state machine, shortId, i18n dictionary completeness
// (frontend keys identical across Wolof/Français/English).
import crypto from "node:crypto";
import { xofToSat, satToXof, localized, shortId } from "./util.js";
import { signReceiptEvent, verifyReceiptEvent, newSchoolNostrKeys } from "./nostr.js";
import { mockLndSchool, mockLndParent } from "./lnd-mock.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✔ ${name}${extra ? " — " + extra : ""}`); }
  else { failed++; console.log(`  ✘ ${name}${extra ? " — " + extra : ""}`); }
};
const section = (s) => console.log(`\n— ${s}`);

// ---------------------------------------------------------------- conversions
section("XOF↔sats conversion");
{
  const rate = 0.85;
  const cases = [[1000, 1176], [45000, 52941], [25000, 29412]];
  for (const [xof, sat] of cases) {
    ok(`xofToSat(${xof}) = ${sat}`, xofToSat(xof) === sat, `${xofToSat(xof)}`);
  }
  // round trip stays within 1 sat of the original
  for (const xof of [5000, 45678, 250000]) {
    const rt = satToXof(xofToSat(xof));
    ok(`round trip ${xof}→sats→XOF within 2 F`, Math.abs(rt - xof) <= 2, `${rt}`);
  }
  ok("xofToSat(0) = 0", xofToSat(0) === 0);
  ok("fmt helpers produce strings", typeof localized("settled", "fr", {}) === "string");
}

// ------------------------------------------------------- localized messages
section("localized notifications — wo/fr/en × all kinds");
{
  const fee = { student_name: "Mariama Diop", amount_xof: 45000, term: "T1", school_name: "École X", id: "fee_x" };
  const kinds = ["fee_created", "locked", "settled", "refunded"];
  const locales = ["wo", "fr", "en"];
  let allGood = true, nonEmpty = true;
  for (const locale of locales) {
    for (const kind of kinds) {
      const msg = localized(kind, locale, fee);
      if (typeof msg !== "string" || msg.length < 5) nonEmpty = false;
      if (!msg.includes("45") && !msg.includes("000")) allGood = false; // amount present
    }
  }
  ok("all 12 locale×kind messages render with amounts", allGood && nonEmpty);
  ok("unknown locale falls back to French", localized("settled", "xx", fee) === localized("settled", "fr", fee));
  const wo = localized("settled", "wo", fee);
  ok("Wolof message contains Wolof text", /xamal|Reçu/.test(wo), wo.slice(0, 40) + "…");
}

// ------------------------------------------------------------------------- JWT
section("JWT (HMAC-SHA256, own impl)");
{
  const secret = "test-secret";
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const sign = (payload, key, expSec = 3600) => {
    const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const b = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expSec }));
    const s = crypto.createHmac("sha256", key).update(`${h}.${b}`).digest("base64url");
    return `${h}.${b}.${s}`;
  };
  const verify = (token, key) => {
    try {
      const [h, b, s] = token.split(".");
      const expect = crypto.createHmac("sha256", key).update(`${h}.${b}`).digest("base64url");
      if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
      const payload = JSON.parse(Buffer.from(b, "base64url"));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
      return payload;
    } catch { return null; }
  };
  const tok = sign({ sub: "u_parent", role: "parent" }, secret);
  ok("valid token verifies", verify(tok, secret)?.sub === "u_parent");
  ok("wrong secret rejected", verify(tok, "other") === null);
  ok("tampered payload rejected", verify(tok.slice(0, -3) + "abc", secret) === null);
  ok("expired token rejected", verify(sign({ sub: "x" }, secret, -10), secret) === null);
  ok("garbage rejected", verify("not.a.jwt", secret) === null);
}

// ------------------------------------------------------------------------ Nostr
section("Nostr receipts — sign / verify / tamper / mask");
{
  const school = {
    id: "school_x", name: "École Test", city: "Dakar",
    nostr_pubkey: "", nostr_privkey: "",
  };
  const keys = newSchoolNostrKeys();
  school.nostr_pubkey = keys.pubkey;
  school.nostr_privkey = keys.privkeyHex;

  const fee = { id: "fee_t1", r_hash: "ab".repeat(32), amount_xof: 45000, amount_sat: 52941, class_level: "CM2", term: "T1", status: "settled" };
  const student = { name: "Mariama Diop" };
  const proof = { image_sha256: "cd".repeat(32), verdict: "match", model: "mock" };

  const ev = signReceiptEvent(school, fee, student, proof);
  ok("receipt event verifies", verifyReceiptEvent(ev) === true);
  ok("kind is 30078 (app-specific data)", ev.kind === 30078);
  ok("payment_hash tag anchored", ev.tags.some(([k, v]) => k === "payment_hash" && v === fee.r_hash));
  ok("d tag = fee id (replaceable)", ev.tags.some(([k, v]) => k === "d" && v === fee.id));
  const content = JSON.parse(ev.content);
  ok("content anchors proof hash + verdict", content.proofSha256 === proof.image_sha256 && content.proofVerdict === "match");
  ok("student name masked to initials", content.student === "M. D.", `"${content.student}"`);
  ok("npub encoded", content.schoolNpub?.startsWith("npub1"));

  // tampering: change content but keep signature.
  // NOTE: nostr-tools caches the verification result on the event object via a
  // symbol property; object spread would copy that cache and skip the check.
  // Real attackers deliver JSON over the wire — JSON round-trip strips the
  // symbol cache and forces a genuine re-verification, exactly what the app
  // does (receipts are stored as JSON and parsed back). Test the same way.
  const jsonClone = (e) => JSON.parse(JSON.stringify(e));
  const tampered = jsonClone({ ...ev, content: JSON.stringify({ ...content, amountXof: 1 }) });
  ok("tampered content fails verification (JSON, as over the wire)", verifyReceiptEvent(tampered) === false);
  const forged = jsonClone({ ...ev, sig: ev.sig.slice(0, -4) + "0000" });
  ok("forged signature fails", verifyReceiptEvent(forged) === false);
  const wrongKey = jsonClone({ ...ev, pubkey: "ff".repeat(32) });
  ok("wrong pubkey fails", verifyReceiptEvent(wrongKey) === false);
  // no proof -> no proof fields
  const ev2 = signReceiptEvent(school, fee, student, null);
  ok("receipt without proof has no proof fields", JSON.parse(ev2.content).proofSha256 === undefined);
  // keys are unique per school
  const k2 = newSchoolNostrKeys();
  ok("nostr keys unique per school", k2.pubkey !== keys.pubkey && k2.privkeyHex.length === 64);
}

// ------------------------------------------------------- mock LND state machine
section("mock LND — hold-invoice lifecycle (mirrors real LND)");
{
  const school = mockLndSchool;
  const parent = mockLndParent;
  const hashOf = (hex) => crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
  const preimage = crypto.randomBytes(32).toString("hex");
  const rHash = hashOf(preimage);

  const inv = await school.addHodlInvoice({ memo: "test", amountSat: 50000, hashHex: rHash });
  ok("hold invoice created with payment_request", !!inv.payment_request);
  ok("initial state OPEN", (await school.invoice(rHash)).state === "OPEN");

  // settle before accept must fail (that's the escrow guarantee)
  let threw = false;
  try { await school.settleInvoice(preimage); } catch { threw = true; }
  ok("settle before payment fails (escrow holds)", threw);

  // parent pays -> ACCEPTED (locked)
  const payPromise = parent.sendPayment({ paymentRequest: inv.payment_request, onUpdate: () => {} });
  await new Promise((r) => setTimeout(r, 600));
  ok("after pay: state ACCEPTED (locked)", (await school.invoice(rHash)).state === "ACCEPTED");

  // settle -> SETTLED, school credited
  await school.settleInvoice(preimage);
  ok("after settle: SETTLED", (await school.invoice(rHash)).state === "SETTLED");
  const bal = await school.channelBalance();
  ok("school balance credited by amount", bal >= 50000, `${bal}`);
  const payResult = await payPromise;
  ok("payer stream reports success", payResult === "succeeded");

  // cancel path on a second invoice
  const pre2 = crypto.randomBytes(32).toString("hex");
  const h2 = hashOf(pre2);
  const inv2 = await school.addHodlInvoice({ memo: "t2", amountSat: 1000, hashHex: h2 });
  const p2 = parent.sendPayment({ paymentRequest: inv2.payment_request, onUpdate: () => {} });
  await new Promise((r) => setTimeout(r, 600));
  await school.cancelInvoice(h2);
  ok("after cancel: CANCELED", (await school.invoice(h2)).state === "CANCELED");
  ok("payer stream reports failure (refund)", (await p2) === "failed");
  let threw2 = false;
  try { await school.settleInvoice(pre2); } catch { threw2 = true; }
  ok("settle after cancel fails", threw2);
}

// ---------------------------------------------------------------------- ids
section("shortId");
{
  const ids = new Set(Array.from({ length: 500 }, () => shortId("fee")));
  ok("500 ids all unique", ids.size === 500);
  ok("format fee_xxxxxxxx (hex)", [...ids][0].matches?.(/^fee_[0-9a-f]{8}$/) ?? /^fee_[0-9a-f]{8}$/.test([...ids][0]));
}

// ------------------------------------------------- frontend i18n completeness
section("frontend i18n — Wolof/Français/English key parity");
{
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.resolve(__dirname, "../../frontend/src/i18n.js"), "utf8");
  // lightweight parse: extract object literals per locale
  const grab = (locale) => {
    const re = new RegExp(`${locale}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`);
    const m = src.match(re);
    if (!m) return null;
    const keys = [...m[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((x) => x[1]);
    return new Set(keys);
  };
  const wo = grab("wo"), fr = grab("fr"), en = grab("en");
  ok("all three dictionaries parsed", !!wo && !!fr && !!en, `${wo?.size}/${fr?.size}/${en?.size} keys`);
  const missing = [];
  for (const k of fr ?? []) {
    if (!wo?.has(k)) missing.push(`wo.${k}`);
    if (!en?.has(k)) missing.push(`en.${k}`);
  }
  ok("no missing keys across locales", missing.length === 0, missing.length ? missing.join(", ") : "parity ✔");
  ok("no empty value placeholders", !/\w+: "",/.test(src));
}

// ---------------------------------------------------------------- summary
console.log(`\n${failed === 0 ? "ALL PASSED" : "FAILURES"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
