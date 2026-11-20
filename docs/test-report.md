# Jàngal — Test Report

**Date:** 2026-11-20 · **Result: 148/148 checks passing (100%)** · Suites: unit 43/43 · smoke E2E 21/21 · extended E2E 84/84

```
$ make test            # one command: unit → fresh mock boot → smoke → extended e2e
✔ 43 passed, 0 failed   (unit-tests.js)
✔ 21 passed, 0 failed   (smoke.js)
✔ 84 passed, 0 failed   (e2e-full.js)
```

The same suites run unchanged against the full Docker stack
(`bitcoind + 2×LND + app`) by pointing them at `http://localhost:3000`.

---

## 1. What is covered

| Area | Suite | Highlights |
|---|---|---|
| **Money math** | unit | XOF↔sats conversion incl. edge values, round-trip stability within 2 F |
| **i18n** | unit | All 12 locale×notification combos (Wolof/Français/English) render amounts; unknown locale falls back to French; **92/92/92 key parity** across the three frontend dictionaries |
| **Auth (JWT)** | unit | Valid token verifies; wrong secret, tampered payload, expired token, garbage all rejected (HMAC-SHA256 + timing-safe compare) |
| **Nostr receipts** | unit | Sign→verify; kind 30078; `payment_hash` + `d` tags anchored; proof hash + verdict embedded; **student name masked to initials (no PII)**; tampered content / forged signature / wrong pubkey all fail verification; keys unique per school |
| **Lightning lifecycle (mock LND)** | unit | OPEN → pay → ACCEPTED → settle → SETTLED with balance credit; settle-before-pay **fails (the escrow guarantee)**; cancel → payer stream reports failure (auto refund); settle-after-cancel fails |
| **Happy path E2E** | smoke | login → fee → pay → **locked** → confirm → settled → **Nostr receipt with valid signature**; reject → auto-refund; AI proof upload → verdict → **anchored in receipt**; HTLC expiry → auto refund; AI assistant; impact metrics; wallet balances move by exact amounts |
| **RBAC matrix** | e2e | parent ✗ create/confirm; family ✗ pay/confirm/create/stats; school ✗ pay (it's the payee); **school2 ✗ confirm/reject/proof another school's fee (404)** |
| **Auth bypass** | e2e | No cookie → 401 on every private route; garbage token, tampered token, unsigned JWT shape → 401; public verifier is the only unauthenticated read (unknown id → 404, not 500) |
| **Input validation** | e2e | Amounts: below min, above max, NaN, negative → 400; unknown student, cross-school student, missing student → 400; min-edge (1 000 F) accepted |
| **State machine guards** | e2e | Confirm-before-pay, double-pay, double-confirm, reject-after-settle, expire-after-settle, proof-after-settle → 409; pay-canceled-fee → 409 |
| **Proof validation** | e2e | Bad mime → 400; missing image → 400; undersized image → 400; valid PNG → verdict + sha256 |
| **Tamper evidence** | e2e | **Photo swapped on disk after settlement → public verifier fails `evidence_intact`**; restored → all green again. Receipt forgery (tampered content/signature) fails Nostr verification |
| **XSS safety** | e2e | `<script>`/`onerror` payloads stored as inert JSON text; responses are `application/json`; CSP + nosniff |
| **Security headers** | e2e | CSP (incl. `frame-ancestors`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, HSTS on https |
| **School ledger** | e2e | Stats shape + exact increment on new settle; CSV export: header, rows, quoting (CSV-injection safe) |
| **Concurrency** | e2e | 10 parallel fee creates → all 200, unique ids; **parallel confirm+reject on the same locked fee → exactly one 200, consistent final state, no 500s** |
| **Nostr relay** | e2e | WebSocket REQ → EVENT + EOSE (5 receipts live); **forged event rejected with `OK:false`** |
| **Rate limiting** | e2e | 150-request burst trips the 240/min limiter (429s observed) while valid traffic is still served |
| **Load** | e2e | 40 parallel public verifications complete in **118 ms** (mock mode), all answered |

## 2. Findings fixed during this pass

1. **Confirm/reject race condition (fixed).** Two concurrent requests on the same
   locked fee could interleave between the status check and the LND call,
   producing a 500 or inconsistent state. `confirm`, `reject` and
   `dev/expire` now re-read the fee after the LND call and return
   `409 … concurrently` when the other writer won. Covered by the
   "exactly one 200" race test.
2. **nostr-tools verification cache (documented, not exploitable).**
   `verifyEvent()` memoizes its result on the event object via a symbol
   property. Spreading a verified event copies the cache and skips
   re-verification — in-memory only. Jàngal only ever verifies events that
   arrived as JSON (`JSON.parse` from SQLite or WebSocket), which strips the
   symbol and forces genuine re-verification. The unit tests pin this
   behaviour so a future refactor cannot silently break it.
3. **Rate-limit test flakiness (test-only).** The burst test initially demanded
   ≥100×200 in a full-suite run where earlier suites had consumed part of the
   per-minute window; the assertion now checks ≥40×200 + 429 present, which is
   the actual behaviour being verified.

## 3. The trust chain (what the public verifier checks)

```
Nostr signature ──► school's registered key ──► Lightning payment hash
                                                          │
Fee settled on the invoice ◄──────────────────────────────┘
        │
        ▼
AI evidence hash recorded at upload == hash anchored in receipt
        │
        ▼
sha256(photo on disk today) == recorded hash   → photo never swapped
```

Anyone can run these checks without an account: open
`/#/verify/<fee_id>` (or `GET /api/public/receipt/<fee_id>`) — zero personal
data is exposed (student initials only). Screenshot 13 in `docs/screenshots/`
shows the verifier turning red when the evidence photo is tampered with.

## 4. Reproduce

```bash
make test                 # unit + smoke + extended e2e (mock LND), ~2 min
# or against the full stack:
docker compose up --build -d && sleep 60
cd backend && node src/smoke.js http://localhost:3000
          && node src/e2e-full.js http://localhost:3000
```

Test sources: `backend/src/unit-tests.js`, `backend/src/smoke.js`,
`backend/src/e2e-full.js` (~1 050 lines of test code total).
