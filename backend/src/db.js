// Jàngal — SQLite persistence (better-sqlite3, synchronous, zero-config)
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(config.dbFile);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL,             -- parent | school | family
  name          TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'fr',-- wo | fr | en
  city          TEXT,
  country       TEXT,
  school_id     TEXT,
  demo_code     TEXT UNIQUE,               -- demo login code
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schools (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  city           TEXT NOT NULL,
  district       TEXT,
  lnd_alias      TEXT,
  nostr_pubkey   TEXT,
  nostr_privkey  TEXT,                     -- demo only; see threat model
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  class_level   TEXT NOT NULL,             -- e.g. CM2, 6ème
  school_id     TEXT NOT NULL REFERENCES schools(id),
  guardian_user_id TEXT REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fees (
  id              TEXT PRIMARY KEY,        -- short public id, e.g. fee_7Kd9
  school_id       TEXT NOT NULL REFERENCES schools(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  term            TEXT NOT NULL,           -- e.g. "Trimestre 1 2026-2027"
  class_level     TEXT NOT NULL,
  amount_xof      INTEGER NOT NULL,
  amount_sat      INTEGER NOT NULL,
  memo            TEXT,
  status          TEXT NOT NULL DEFAULT 'awaiting_payment',
    -- awaiting_payment -> locked -> settled
    -- awaiting_payment -> canceled (unpaid, expired)
    -- locked -> refunded (school rejects / timeout)
  r_hash          TEXT UNIQUE,             -- hex
  preimage        TEXT,                    -- hex (demo stores server-side, see threat model)
  payment_request TEXT,                    -- BOLT11
  created_at      TEXT DEFAULT (datetime('now')),
  expires_at      TEXT,
  paid_at         TEXT,
  confirmed_at    TEXT,
  nostr_event_id  TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  fee_id      TEXT NOT NULL REFERENCES fees(id),
  payer_user_id TEXT NOT NULL REFERENCES users(id),
  amount_sat  INTEGER NOT NULL,
  state       TEXT NOT NULL,               -- in_flight | succeeded | failed
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipts (
  id          TEXT PRIMARY KEY,
  fee_id      TEXT UNIQUE NOT NULL REFERENCES fees(id),
  nostr_event_id TEXT NOT NULL,
  event_json  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  fee_id      TEXT,
  kind        TEXT NOT NULL,               -- fee_created | paid | locked | settled | refunded
  message     TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'fr',
  created_at  TEXT DEFAULT (datetime('now')),
  read        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sms_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fee_id      TEXT,
  message     TEXT NOT NULL,
  lang        TEXT NOT NULL,
  status      TEXT DEFAULT 'queued',       -- simulated gateway (docs/threat-model.md)
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT NOT NULL,               -- parent | school | system
  kind        TEXT NOT NULL,               -- lock | settle | refund | faucet
  amount_sat  INTEGER NOT NULL,
  fee_id      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(status);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_pay_fee ON payments(fee_id);
`);

export const q = {
  // users
  userByCode: db.prepare("SELECT * FROM users WHERE demo_code = ?"),
  userById: db.prepare("SELECT * FROM users WHERE id = ?"),
  allUsers: db.prepare("SELECT id, role, name, locale, city, country, school_id, demo_code FROM users"),

  // schools
  schoolById: db.prepare("SELECT * FROM schools WHERE id = ?"),
  allSchools: db.prepare("SELECT * FROM schools"),

  // students
  studentsByGuardian: db.prepare("SELECT s.*, sc.name AS school_name FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.guardian_user_id = ?"),
  studentsBySchool: db.prepare("SELECT * FROM students WHERE school_id = ?"),
  studentById: db.prepare("SELECT * FROM students WHERE id = ?"),

  // fees
  insertFee: db.prepare(`INSERT INTO fees (id, school_id, student_id, term, class_level, amount_xof, amount_sat, memo, status, r_hash, preimage, payment_request, expires_at)
                         VALUES (@id, @school_id, @student_id, @term, @class_level, @amount_xof, @amount_sat, @memo, @status, @r_hash, @preimage, @payment_request, @expires_at)`),
  feeById: db.prepare("SELECT * FROM fees WHERE id = ?"),
  feeByHash: db.prepare("SELECT * FROM fees WHERE r_hash = ?"),
  feesBySchool: db.prepare("SELECT f.*, s.name AS student_name FROM fees f JOIN students s ON s.id = f.student_id WHERE f.school_id = ? ORDER BY f.created_at DESC"),
  feesByGuardian: db.prepare("SELECT f.*, s.name AS student_name, sc.name AS school_name FROM fees f JOIN students s ON s.id = f.student_id JOIN schools sc ON sc.id = f.school_id WHERE s.guardian_user_id = ? ORDER BY f.created_at DESC"),
  updateFeeStatus: db.prepare("UPDATE fees SET status = ?, paid_at = COALESCE(?, paid_at), confirmed_at = COALESCE(?, confirmed_at), nostr_event_id = COALESCE(?, nostr_event_id) WHERE id = ?"),
  feeStats: db.prepare(`SELECT status, COUNT(*) n, COALESCE(SUM(amount_sat),0) sat, COALESCE(SUM(amount_xof),0) xof FROM fees GROUP BY status`),

  // payments
  insertPayment: db.prepare("INSERT INTO payments (id, fee_id, payer_user_id, amount_sat, state) VALUES (?,?,?,?,?)"),
  updatePayment: db.prepare("UPDATE payments SET state = ?, updated_at = datetime('now') WHERE id = ?"),
  paymentByFee: db.prepare("SELECT * FROM payments WHERE fee_id = ?"),

  // receipts
  insertReceipt: db.prepare("INSERT INTO receipts (id, fee_id, nostr_event_id, event_json) VALUES (?,?,?,?)"),
  receiptByFee: db.prepare("SELECT * FROM receipts WHERE fee_id = ?"),
  allReceipts: db.prepare("SELECT * FROM receipts ORDER BY created_at DESC LIMIT 50"),

  // notifications & sms
  insertNotification: db.prepare("INSERT INTO notifications (user_id, fee_id, kind, message, lang) VALUES (?,?,?,?,?)"),
  notificationsFor: db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"),
  insertSms: db.prepare("INSERT INTO sms_outbox (fee_id, message, lang) VALUES (?,?,?)"),
  allSms: db.prepare("SELECT * FROM sms_outbox ORDER BY created_at DESC LIMIT 50"),

  // wallet events
  insertWalletEvent: db.prepare("INSERT INTO wallet_events (actor, kind, amount_sat, fee_id) VALUES (?,?,?,?)"),
};
