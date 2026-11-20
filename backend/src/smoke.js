// Jàngal — end-to-end smoke test (runs against a live instance).
//   node src/smoke.js  [baseUrl]
// Exercises: login → fee creation → Lightning payment (locked escrow) →
// school confirmation → Nostr receipt, plus the rejection/refund path.
const BASE = process.argv[2] ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}${extra ? " — " + extra : ""}`);
  } else {
    failed++;
    console.log(`  ✘ ${name}${extra ? " — " + extra : ""}`);
  }
};

async function client() {
  let cookie = "";
  return {
    async req(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let json = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, json };
    },
    async login(code) {
      cookie = "";
      return this.req("POST", "/api/auth/login", { code });
    },
  };
}

const school = await client();
const parent = await client();

console.log("Jàngal E2E smoke test —", BASE);

// 1. health
{
  const r = await fetch(BASE + "/api/health");
  ok("health check", r.status === 200);
}

// 2. logins
ok("school login (code 3333)", (await school.login("3333")).status === 200);
ok("parent login (code 1111)", (await parent.login("1111")).status === 200);

// 3. parent sees students
{
  const r = await parent.req("GET", "/api/family/students");
  ok("parent students list", r.status === 200 && r.json.students?.length >= 2, `${r.json.students?.length ?? 0} students`);
}

// 4. school creates a fee
let feeId;
{
  const r = await school.req("POST", "/api/fees", {
    studentId: "s_ibrahima",
    term: "Trimestre 1 2026-2027",
    classLevel: "6ème",
    amountXof: 52500,
    memo: "Frais de scolarité — smoke test",
  });
  feeId = r.json?.fee?.id;
  ok("school creates fee (hold invoice)", r.status === 200 && !!r.json?.fee?.payment_request, `${feeId}`);
}

// 5. parent pays -> locked
{
  const before = await parent.req("GET", "/api/wallet");
  const balBefore = before.json?.balanceSat ?? 0;
  const r = await parent.req("POST", `/api/fees/${feeId}/pay`, {});
  ok("parent pays (funds locked in escrow)", r.status === 200 && r.json.feeStatus === "locked", `status=${r.json?.feeStatus}`);
  const detail = await parent.req("GET", `/api/fees/${feeId}`);
  ok("fee detail shows locked", detail.json?.fee?.status === "locked");
  const after = await parent.req("GET", "/api/wallet");
  ok("parent balance decreased by fee amount", (after.json?.balanceSat ?? 0) <= balBefore - 60000, `${balBefore} → ${after.json?.balanceSat} sats (channel balance drops while HTLC in flight)`);
}

// 6. school confirms -> settled + receipt
{
  const r = await school.req("POST", `/api/fees/${feeId}/confirm`, {});
  ok("school confirms (invoice settled)", r.status === 200 && r.json.status === "settled");
  const rec = await parent.req("GET", `/api/receipts/${feeId}`);
  ok("Nostr receipt exists and signature verifies", rec.status === 200 && rec.json.valid === true, rec.json?.eventId?.slice(0, 16) + "…");
  const wallet = await school.req("GET", "/api/wallet");
  ok("school wallet credited", (wallet.json?.balanceSat ?? 0) > 0, `${wallet.json?.balanceSat} sats`);
}

// 7. refund path
{
  const r = await school.req("POST", "/api/fees", {
    studentId: "s_mariama",
    term: "Trimestre 2 2026-2027",
    classLevel: "CM2",
    amountXof: 30000,
    memo: "Frais — smoke refund",
  });
  const fid = r.json?.fee?.id;
  const p = await parent.req("POST", `/api/fees/${fid}/pay`, {});
  ok("second fee paid & locked", p.json?.feeStatus === "locked");
  const rej = await school.req("POST", `/api/fees/${fid}/reject`, {});
  ok("school rejects -> automatic refund", rej.status === 200 && rej.json.status === "refunded");
}

// 7b. AI-verified proof photo: upload -> verdict -> anchored in receipt
{
  // deterministic valid PNG (120x120 RGB, ~1.5 KB) built in pure Node
  const zlib = await import("node:zlib");
  const crc32 = (buf) => {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const mkPng = (w, h) => {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    let seed = 42; // deterministic LCG — incompressible enough to stay > 1 KB
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0; // filter byte
      for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = next();
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // 8-bit RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  };
  const b64 = mkPng(120, 120).toString("base64");

  const r = await school.req("POST", "/api/fees", {
    studentId: "s_ibrahima",
    term: "Trimestre 3 2026-2027",
    classLevel: "6ème",
    amountXof: 25000,
    memo: "Frais — smoke proof",
  });
  const fid = r.json?.fee?.id;
  const p = await parent.req("POST", `/api/fees/${fid}/pay`, {});
  ok("third fee paid & locked", p.json?.feeStatus === "locked");

  const up = await school.req("POST", `/api/fees/${fid}/proof`, { imageBase64: b64, mime: "image/png" });
  ok(
    "proof uploaded, AI verdict returned",
    up.status === 200 && ["match", "mismatch", "unclear"].includes(up.json?.verdict) && up.json.imageSha256?.length === 64,
    `verdict=${up.json?.verdict} model=${up.json?.model}`
  );

  const conf = await school.req("POST", `/api/fees/${fid}/confirm`, {});
  ok("proof-bearing fee confirmed", conf.status === 200 && conf.json.status === "settled");
  const rec = await parent.req("GET", `/api/receipts/${fid}`);
  ok(
    "receipt anchors proof hash + AI verdict",
    rec.json?.content?.proofSha256 === up.json?.imageSha256 && !!rec.json?.content?.proofVerdict,
    `${rec.json?.content?.proofVerdict} / ${rec.json?.content?.proofSha256?.slice(0, 12)}…`
  );
  const img = await parent.req("GET", `/api/fees/${fid}/proof/image`);
  ok("proof image served back", img.status === 200);
}

// 7c. timeout auto-refund (HTLC expiry)
{
  const r = await school.req("POST", "/api/fees", {
    studentId: "s_mariama",
    term: "Année scolaire 2026-2027",
    classLevel: "CM2",
    amountXof: 15000,
    memo: "Frais — smoke timeout",
  });
  const fid = r.json?.fee?.id;
  await parent.req("POST", `/api/fees/${fid}/pay`, {});
  const exp = await parent.req("POST", `/api/dev/expire/${fid}`, {});
  ok("hold-invoice expiry -> automatic refund", exp.status === 200 && exp.json.status === "refunded", exp.json?.note ?? "");
}

// 8. AI layer (mock provider default)
{
  const r = await fetch(BASE + "/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "How does Jàngal work?", locale: "en" }),
  });
  const j = await r.json();
  ok("AI assistant answers", r.status === 200 && typeof j.answer === "string" && j.answer.length > 20);
}

// 9. impact
{
  const r = await fetch(BASE + "/api/impact");
  const j = await r.json();
  ok("impact metrics", r.status === 200 && j.fees.settled >= 1, `${j.fees.settled} settled, ${j.fees.satsSettled} sats for education`);
}

console.log(`\n${failed === 0 ? "ALL PASSED" : "FAILURES"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
