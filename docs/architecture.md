# Jàngal — Architecture

## Overview

Jàngal is a purpose-locked payment rail: the sender specifies what the money is
for (school fees), and the Lightning Network enforces that purpose. The core
primitive is the **hold invoice** (BOLT 11 with a preimage the payee reveals
only when it decides to accept the payment).

```
                 ┌─────────────────────────────────────────────┐
                 │         Diaspora parent — Paris             │
                 │   React PWA  (wo · fr · en, 63 KB gz)       │
                 └───────────────────┬─────────────────────────┘
                                     │ HTTPS, JWT cookie
                 ┌───────────────────▼─────────────────────────┐
                 │              Fastify app :3000              │
                 │                                             │
                 │  routes/api.js  ── fee state machine        │
                 │  lnd.js         ── LND REST client          │
                 │  nostr.js       ── receipts + relay         │
                 │  ai.js          ── parser + assistant       │
                 │  db.js          ── SQLite (WAL)             │
                 │  seed.js        ── bootstrap: wallets,      │
                 │                    channel, demo data       │
                 │  smoke.js       ── E2E test (15 checks)     │
                 └───────┬─────────────────────┬───────────────┘
                         │                     │
              LND REST (school)         ws relay (/nostr)
                         │                     │
        ┌────────────────▼───────┐   ┌─────────▼──────────┐
        │  lnd-school (LND)      │   │  any Nostr client  │
        │  holds hold-invoices   │   │  can verify the    │
        └────────────┬───────────┘   │  signed receipts   │
                     │  HTLC over a private channel (regtest)
        ┌────────────▼───────────┐    └────────────────────┘
        │  lnd-parent (LND)      │
        │  pays fee invoices     │
        └────────────┬───────────┘
                     │
        ┌────────────▼───────────┐
        │  bitcoind (regtest)    │
        └────────────────────────┘
```

## The fee state machine

```
            create (school)             pay (parent)
 ┌─────────► awaiting_payment ──────────────────► locked ──confirm──► settled
 │                    │                             │
 │                 expire                        reject / timeout
 │                    ▼                             ▼
 └─────────────── canceled ◄────────────────── refunded
```

| Transition | Lightning primitive | Who acts |
|---|---|---|
| `awaiting_payment` | `AddHoldInvoice(hash, amt)` — school's node creates an invoice whose preimage only Jàngal (for the school) knows | school |
| → `locked` | parent's node `SendPaymentV2`; the HTLC is accepted, funds leave the parent's balance but are **not** claimable by the school yet | parent |
| → `settled` | `SettleInvoice(preimage)` — school confirms; the HTLC completes, school balance increases | school |
| → `refunded` | `CancelInvoice(hash)` — the HTLC fails; funds return to the parent automatically (no trust, no manual refund) | school / timeout worker |

The preimage/hash pair is generated server-side per fee (`crypto.randomBytes` +
SHA-256). The DB stores the invoice hash, request, state and timing — never
wallet keys.

## Payments & polling

`SendPaymentV2` streams NDJSON updates; the app treats the **invoice state on
the school node** (`OPEN/ACCEPTED/SETTLED/CANCELED`) as the source of truth and
syncs the DB whenever a fee is read (`syncFee`). This keeps the state machine
idempotent and crash-safe: any missed stream event is healed on the next poll.

## Nostr receipts

On settle, the school's Nostr key (generated per school at seed, `secp256k1`
via `nostr-tools`) signs a **kind 30078** (application-specific data) event:

```json
{
  "kind": 30078,
  "tags": [["t","jangal"],["t","school-fees"],["d","<feeId>"],["payment_hash","<hex>"]],
  "content": "{\"v\":1,\"feeId\":\"…\",\"school\":\"…\",\"student\":\"M. D.\",
               \"classLevel\":\"CM2\",\"term\":\"Trimestre 1\",\"amountXof\":45000,
               \"amountSat\":52941,\"settledAt\":\"…\"}"
}
```

- Student names are **masked to initials** — proof without PII.
- Events are served by the **embedded relay** at `ws://<host>/nostr`
  (EVENT/REQ/CLOSE subset, signature-checked) and also stored in SQLite.
- The receipts page re-verifies `id`/`sig` with `nostr-tools.verifyEvent` —
  anyone can paste the event into any Nostr client and confirm.

## AI layer

`ai.js` has two providers behind one interface:

- **mock** (default): deterministic heuristics — amount regex for FCFA,
  Francophone class levels (CI…CM2, 6ème…Tle), trimester hints. Zero network.
- **openai-compatible**: any `/v1/chat/completions` endpoint (GLM, GPT, Groq…)
  with a JSON-mode prompt for parsing and a grounded FAQ prompt for the
  assistant. Config: `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`.

The mock provider guarantees the demo is **offline-reproducible for judges**;
the LLM provider shows the production path (photo → structured fee in any
language).

## FCFA ↔ sats

Regtest has no market. The demo rate is fixed by `RATE_XOF_PER_SAT` (default
0.85 — derivation in [impact.md](impact.md)) and shown everywhere an amount is
displayed. In production this would be a rate feed + slippage margin.

## Dev tools

- `POST /api/dev/mine` — mines regtest blocks (channel confirmations); guarded
  by `ALLOW_MINING=1` on hosted deployments.
- `LND_MODE=mock` — full state-machine simulation of both LND nodes for UI
  work and CI without Lightning infrastructure.
- `node src/smoke.js` — 15-assertion E2E (happy path + refund + receipts + AI).

## Scaling notes (post-hackathon)

- Fees/polling scale horizontally (SQLite → Postgres, per-school read replicas).
- Each school runs its **own** LND node (or shared node with macaroon
  scoping) — the app never needs custody.
- Receipts can move to public relays + on-chain anchoring for third-party
  verifiability.
