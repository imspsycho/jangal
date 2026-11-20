// Jàngal — REST API: the purpose-locked fee escrow state machine.
//
//   awaiting_payment --pay--> locked --confirm--> settled
//          |                    |
//        expire               reject/timeout
//          v                    v
//       canceled             refunded
//
// Money never sits in our app: HTLCs on Lightning hold it (hold invoices),
// the school's LND node settles or cancels, and every settle produces a
// Nostr-signed receipt.
import crypto from "node:crypto";
import { q } from "../db.js";
import { lndSchool, lndParent, newPreimage, hashOf } from "../lnd.js";
import { config } from "../config.js";
import { signReceiptEvent, storeReceipt, verifyReceiptEvent } from "../nostr.js";
import { xofToSat, shortId, localized, queueSms } from "../util.js";
import { parseFeeNote, ask as aiAsk } from "../ai.js";
import { mine } from "../bitcoind.js";

// ------------------------------------------------------------------ auth util
const b64u = (buf) => Buffer.from(buf).toString("base64url");

function signJwt(payload) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 12 * 3600 }));
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  try {
    const [h, b, s] = token.split(".");
    const expect = crypto.createHmac("sha256", config.jwtSecret).update(`${h}.${b}`).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
    const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function guard(req, reply, roles) {
  const token = req.cookies?.jangal_token;
  const payload = token ? verifyJwt(token) : null;
  if (!payload) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const user = q.userById.get(payload.sub);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

// ------------------------------------------------------- fee state sync core
export async function syncFee(fee, { notify = true } = {}) {
  if (["settled", "refunded", "canceled"].includes(fee.status)) return fee;

  let invoice;
  try {
    invoice = await lndSchool.invoice(fee.r_hash);
  } catch {
    return fee; // invoice not found on node (e.g. expired) — leave as-is
  }

  const student = q.studentById.get(fee.student_id);
  const school = q.schoolById.get(fee.school_id);
  const view = { ...fee, student_name: student?.name ?? "", school_name: school?.name ?? "" };
  const parent = q.userById.get(student?.guardian_user_id ?? "");

  if (invoice.state === "ACCEPTED" && fee.status !== "locked") {
    q.updateFeeStatus.run("locked", new Date().toISOString(), null, null, fee.id);
    q.insertWalletEvent.run("system", "lock", fee.amount_sat, fee.id);
    if (notify) {
      for (const [user, kind] of [[parent, "locked"]]) {
        if (user) {
          q.insertNotification.run(user.id, fee.id, kind, localized(kind, user.locale, view), user.locale);
          queueSms(kind, view, user.locale);
        }
      }
    }
    fee.status = "locked";
  } else if (invoice.state === "CANCELED") {
    const next = fee.status === "locked" ? "refunded" : "canceled";
    q.updateFeeStatus.run(next, null, null, null, fee.id);
    if (fee.status === "locked" && notify) {
      q.insertNotification.run(parent?.id, fee.id, "refunded", localized("refunded", parent?.locale ?? "fr", view), parent?.locale ?? "fr");
      queueSms("refunded", view, parent?.locale ?? "fr");
      q.insertWalletEvent.run("system", "refund", fee.amount_sat, fee.id);
    }
    fee.status = next;
  } else if (invoice.state === "SETTLED" && fee.status !== "settled") {
    settleBookkeeping(fee, { notify });
    fee.status = "settled";
  } else if (fee.status === "awaiting_payment" && new Date(fee.expires_at) < new Date()) {
    try { await lndSchool.cancelInvoice(fee.r_hash); } catch { /* already gone */ }
    q.updateFeeStatus.run("canceled", null, null, null, fee.id);
    fee.status = "canceled";
  }
  return fee;
}

// settle bookkeeping shared by /confirm and the sync fallback
export function settleBookkeeping(fee, { notify = true } = {}) {
  const now = new Date().toISOString();
  const student = q.studentById.get(fee.student_id);
  const school = q.schoolById.get(fee.school_id);
  const view = { ...fee, student_name: student?.name ?? "", school_name: school?.name ?? "" };

  // Nostr-signed receipt
  const event = signReceiptEvent(school, { ...fee, r_hash: fee.r_hash }, student);
  storeReceipt({ ...fee }, event);

  q.updateFeeStatus.run("settled", fee.paid_at ?? now, now, event.id, fee.id);
  q.insertWalletEvent.run("school", "settle", fee.amount_sat, fee.id);

  if (notify) {
    const parent = q.userById.get(student?.guardian_user_id ?? "");
    const family = q.userById.get("u_family");
    for (const u of [parent, family]) {
      if (!u) continue;
      q.insertNotification.run(u.id, fee.id, "settled", localized("settled", u.locale, view), u.locale);
      if (u.role === "family") queueSms("settled", view, u.locale);
    }
  }
  return event;
}

// ---------------------------------------------------------------- routes
export function registerRoutes(app) {
  // ---- auth ---------------------------------------------------------------
  app.post("/api/auth/login", async (req, reply) => {
    const { code } = req.body ?? {};
    const user = typeof code === "string" ? q.userByCode.get(code.trim()) : null;
    if (!user) return reply.code(401).send({ error: "invalid demo code" });
    const token = signJwt({ sub: user.id, role: user.role, name: user.name });
    reply.setCookie("jangal_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 3600,
    });
    return { ok: true, user: { id: user.id, role: user.role, name: user.name, locale: user.locale, schoolId: user.school_id } };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie("jangal_token", { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (req, reply) => {
    const user = guard(req, reply);
    if (!user) return;
    return {
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        locale: user.locale,
        city: user.city,
        country: user.country,
        schoolId: user.school_id,
      },
    };
  });

  // ---- meta & impact --------------------------------------------------------
  app.get("/api/meta", async () => ({
    rate: { xofPerSat: config.rate.xofPerSat },
    feeExpirySeconds: config.fees.expirySeconds,
    aiProvider: config.ai.provider,
    network: "regtest",
  }));

  app.get("/api/impact", async () => {
    const stats = q.feeStats.all();
    const byStatus = Object.fromEntries(stats.map((s) => [s.status, s]));
    return {
      fees: {
        settled: byStatus.settled?.n ?? 0,
        locked: byStatus.locked?.n ?? 0,
        awaiting: byStatus.awaiting_payment?.n ?? 0,
        refunded: byStatus.refunded?.n ?? 0,
        satsSettled: byStatus.settled?.sat ?? 0,
        xofSettled: byStatus.settled?.xof ?? 0,
      },
      schools: q.allSchools.all().length,
      citations: [
        { label: "Households receiving remittances (Senegal, 2019)", value: "23%" },
        { label: "Remittance fees via traditional operators", value: "7–10%" },
        { label: "Lightning fee on a Jàngal fee payment (measured, regtest)", value: "< 0.01%" },
      ],
    };
  });

  // ---- family / students -----------------------------------------------------
  app.get("/api/family/students", async (req, reply) => {
    const user = guard(req, reply, ["parent"]);
    if (!user) return;
    const students = q.studentsByGuardian.all(user.id);
    const fees = q.feesByGuardian.all(user.id);
    return {
      students: students.map((s) => ({
        ...s,
        openFees: fees.filter((f) => f.student_id === s.id && ["awaiting_payment", "locked"].includes(f.status)).length,
      })),
      fees: fees.map(withLocaleAmounts),
    };
  });

  // ---- fees -------------------------------------------------------------------
  app.get("/api/fees", async (req, reply) => {
    const user = guard(req, reply, ["parent", "school", "family"]);
    if (!user) return;
    if (user.role === "school") {
      const rows = q.feesBySchool.all(user.school_id);
      const synced = [];
      for (const f of rows) synced.push(await syncFee(f, { notify: true }));
      return { fees: synced.map(withLocaleAmounts) };
    }
    if (user.role === "family") {
      // family sees everything for the household (single demo family)
      const rows = q.feesByGuardian.all("u_parent");
      return { fees: rows.map(withLocaleAmounts) };
    }
    const rows = q.feesByGuardian.all(user.id);
    const synced = [];
    for (const f of rows) synced.push(await syncFee(f, { notify: true }));
    return { fees: synced.map(withLocaleAmounts) };
  });

  app.get("/api/fees/:id", async (req, reply) => {
    guard(req, reply);
    const fee = q.feeById.get(req.params.id);
    if (!fee) return reply.code(404).send({ error: "not found" });
    const synced = await syncFee(fee);
    const student = q.studentById.get(synced.student_id);
    const school = q.schoolById.get(synced.school_id);
    const payment = q.paymentByFee.get(synced.id);
    const receipt = q.receiptByFee.get(synced.id);
    return {
      fee: withLocaleAmounts({ ...synced, student_name: student?.name, school_name: school?.name }),
      payment: payment ? { state: payment.state, amount_sat: payment.amount_sat } : null,
      receipt: receipt ? { eventId: receipt.nostr_event_id, event: JSON.parse(receipt.event_json) } : null,
    };
  });

  // school creates a fee -> hold invoice
  app.post("/api/fees", async (req, reply) => {
    const user = guard(req, reply, ["school"]);
    if (!user) return;
    const { studentId, term, classLevel, amountXof, memo } = req.body ?? {};
    const student = q.studentById.get(studentId);
    if (!student || student.school_id !== user.school_id) {
      return reply.code(400).send({ error: "student not found in your school" });
    }
    const amount = Math.round(Number(amountXof));
    if (!Number.isFinite(amount) || amount < 1000 || amount > 5_000_000) {
      return reply.code(400).send({ error: "amountXof out of range (1 000 – 5 000 000)" });
    }
    const school = q.schoolById.get(user.school_id);
    const fee = {
      id: shortId("fee"),
      school_id: user.school_id,
      student_id: studentId,
      term: String(term ?? "").slice(0, 80) || "Trimestre 1",
      class_level: String(classLevel ?? student.class_level).slice(0, 20),
      amount_xof: amount,
      amount_sat: xofToSat(amount),
      memo: String(memo ?? "Frais de scolarité").slice(0, 120),
      status: "awaiting_payment",
      r_hash: "",
      preimage: "",
      payment_request: "",
      expires_at: new Date(Date.now() + config.fees.expirySeconds * 1000).toISOString(),
    };
    const preimage = newPreimage();
    fee.preimage = preimage;
    fee.r_hash = hashOf(preimage);
    const inv = await lndSchool.addHodlInvoice({
      memo: `Jàngal — ${fee.memo} — ${fee.term} — ${fee.id}`,
      amountSat: fee.amount_sat,
      hashHex: fee.r_hash,
      expirySeconds: config.fees.expirySeconds,
    });
    fee.payment_request = inv.payment_request;
    q.insertFee.run(fee);

    const view = { ...fee, student_name: student.name, school_name: school.name };
    const parent = q.userById.get(student.guardian_user_id);
    if (parent) {
      q.insertNotification.run(parent.id, fee.id, "fee_created", localized("fee_created", parent.locale, view), parent.locale);
    }
    return { fee: withLocaleAmounts({ ...fee, student_name: student.name, school_name: school.name }) };
  });

  // parent pays -> funds become LOCKED (HTLC in flight, not claimable by school yet)
  app.post("/api/fees/:id/pay", async (req, reply) => {
    const user = guard(req, reply, ["parent"]);
    if (!user) return;
    const fee = q.feeById.get(req.params.id);
    if (!fee) return reply.code(404).send({ error: "not found" });
    if (fee.status !== "awaiting_payment") {
      return reply.code(409).send({ error: `fee is ${fee.status}, not payable` });
    }

    const paymentId = shortId("pay");
    q.insertPayment.run(paymentId, fee.id, user.id, fee.amount_sat, "in_flight");

    // fire the payment from the parent's LND node; the HTLC stays in flight
    // while the school decides (that IS the escrow)
    lndParent
      .sendPayment({
        paymentRequest: fee.payment_request,
        timeoutSeconds: Math.max(config.fees.expirySeconds, 3600),
        feeLimitSat: Math.max(50, Math.round(fee.amount_sat * 0.01)),
        onUpdate: (u) => {
          if (u.status === "SUCCEEDED") q.updatePayment.run("succeeded", paymentId);
          else if (u.status === "FAILED") q.updatePayment.run("failed", paymentId);
        },
      })
      .catch((e) => {
        console.error("[pay] stream error:", e.message);
        q.updatePayment.run("failed", paymentId);
      });

    // wait briefly for the lock to materialize so the UI feels instant
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const f = await syncFee(q.feeById.get(fee.id));
      if (f.status === "locked") break;
    }
    const fresh = q.feeById.get(fee.id);
    return { ok: true, paymentId, feeStatus: fresh.status };
  });

  // school confirms -> hold invoice settles -> receipt signed on Nostr
  app.post("/api/fees/:id/confirm", async (req, reply) => {
    const user = guard(req, reply, ["school"]);
    if (!user) return;
    const fee = q.feeById.get(req.params.id);
    if (!fee || fee.school_id !== user.school_id) return reply.code(404).send({ error: "not found" });
    if (fee.status !== "locked") return reply.code(409).send({ error: "fee is not in locked state" });

    await lndSchool.settleInvoice(fee.preimage);
    const event = settleBookkeeping(fee);
    const payment = q.paymentByFee.get(fee.id);
    if (payment) q.updatePayment.run("succeeded", payment.id);
    return { ok: true, status: "settled", receiptEventId: event.id };
  });

  // school rejects / auto-timeout -> funds return to the parent automatically
  app.post("/api/fees/:id/reject", async (req, reply) => {
    const user = guard(req, reply, ["school"]);
    if (!user) return;
    const fee = q.feeById.get(req.params.id);
    if (!fee || fee.school_id !== user.school_id) return reply.code(404).send({ error: "not found" });
    if (!["locked", "awaiting_payment"].includes(fee.status)) {
      return reply.code(409).send({ error: "fee cannot be rejected from this state" });
    }
    await lndSchool.cancelInvoice(fee.r_hash);
    const next = fee.status === "locked" ? "refunded" : "canceled";
    const student = q.studentById.get(fee.student_id);
    const school = q.schoolById.get(fee.school_id);
    const view = { ...fee, student_name: student?.name ?? "", school_name: school?.name ?? "" };
    const parent = q.userById.get(student?.guardian_user_id ?? "");
    if (parent) {
      q.insertNotification.run(parent.id, fee.id, "refunded", localized("refunded", parent.locale, view), parent.locale);
      queueSms("refunded", view, parent.locale);
    }
    q.insertWalletEvent.run("system", "refund", fee.amount_sat, fee.id);
    q.updateFeeStatus.run(next, null, null, null, fee.id);
    return { ok: true, status: next };
  });

  // ---- receipts ------------------------------------------------------------
  app.get("/api/receipts", async (req, reply) => {
    const user = guard(req, reply);
    if (!user) return;
    const rows = q.allReceipts.all();
    return {
      receipts: rows.map((r) => {
        const event = JSON.parse(r.event_json);
        return {
          feeId: r.fee_id,
          eventId: r.nostr_event_id,
          createdAt: r.created_at,
          valid: verifyReceiptEvent(event),
          content: JSON.parse(event.content),
        };
      }),
    };
  });

  app.get("/api/receipts/:feeId", async (req, reply) => {
    const r = q.receiptByFee.get(req.params.feeId);
    if (!r) return reply.code(404).send({ error: "no receipt for this fee" });
    const event = JSON.parse(r.event_json);
    return {
      feeId: r.fee_id,
      eventId: r.nostr_event_id,
      valid: verifyReceiptEvent(event),
      event,
      content: JSON.parse(event.content),
    };
  });

  // ---- wallets ---------------------------------------------------------------
  app.get("/api/wallet", async (req, reply) => {
    const user = guard(req, reply, ["parent", "school"]);
    if (!user) return;
    if (user.role === "parent") {
      const [balance, info] = await Promise.all([lndParent.channelBalance(), lndParent.getInfo().catch(() => ({}))]);
      return { role: "parent", balanceSat: balance, alias: info.alias ?? "lnd-parent" };
    }
    const [balance, info] = await Promise.all([lndSchool.channelBalance(), lndSchool.getInfo().catch(() => ({}))]);
    return { role: "school", balanceSat: balance, alias: info.alias ?? "lnd-school" };
  });

  // ---- notifications / sms -----------------------------------------------------
  app.get("/api/notifications", async (req, reply) => {
    const user = guard(req, reply);
    if (!user) return;
    return { notifications: q.notificationsFor.all(user.id) };
  });

  app.get("/api/sms", async (req, reply) => {
    const user = guard(req, reply);
    if (!user) return;
    return { messages: q.allSms.all() };
  });

  // ---- AI ----------------------------------------------------------------------
  app.post("/api/ai/parse-note", async (req, reply) => {
    const user = guard(req, reply, ["school"]);
    if (!user) return;
    const { text, locale } = req.body ?? {};
    if (!text || typeof text !== "string" || text.length > 2000) {
      return reply.code(400).send({ error: "text required (max 2000 chars)" });
    }
    return { draft: await parseFeeNote(text, locale ?? "fr") };
  });

  app.post("/api/ai/ask", async (req, reply) => {
    const { question, locale, history } = req.body ?? {};
    if (!question || typeof question !== "string" || question.length > 1000) {
      return reply.code(400).send({ error: "question required" });
    }
    const answer = await aiAsk(question, locale ?? "fr", Array.isArray(history) ? history.slice(-6) : []);
    return { answer };
  });

  // ---- dev tools (regtest demo only) ---------------------------------------------
  app.post("/api/dev/mine", async (req, reply) => {
    if (config.isProd && process.env.ALLOW_MINING !== "1") {
      // mining is part of the regtest demo; enabled via env on hosted demos
      return reply.code(403).send({ error: "mining disabled on this deployment" });
    }
    const blocks = Math.min(6, Math.max(1, Number(req.body?.blocks ?? 1)));
    const addr = (await lndSchool.newAddress()).address;
    const hashes = await mine(blocks, addr);
    return { ok: true, mined: blocks, tip: hashes?.[hashes.length - 1] };
  });
}

// helpers -----------------------------------------------------------------
function withLocaleAmounts(f) {
  return { ...f, amount_xof_fmt: Number(f.amount_xof).toLocaleString("fr-FR") + " F", amount_sat_fmt: Number(f.amount_sat).toLocaleString("fr-FR") + " sats" };
}
