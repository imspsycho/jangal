# Jàngal — Threat model & security by design

## Assets

1. **Money in flight** — sats locked in HTLCs between parent and school.
2. **Fee records** — who paid what, for which student, when.
3. **Receipts** — Nostr events proving the school confirmed a payment.
4. **Secrets** — school Nostr keys, LND credentials, JWT secret, preimages.

## Trust boundaries

```
parent PWA ──HTTPS── app ──LND REST── lnd-school
                     │                (private docker network)
family PWA ──HTTPS── app ──bitcoind RPC── bitcoind
school PWA ──HTTPS── app
                       └──ws── embedded Nostr relay (public)
```

## The core security property

**Jàngal cannot steal, redirect or freeze fee payments.** Funds move only as
Lightning HTLCs between the parent's and the school's nodes:

- while locked, neither side can unilaterally claim;
- the school settles only by revealing the preimage (i.e. only after *it*
  decided to accept);
- on cancel/timeout the HTLC fails and the money **returns to the parent by
  protocol**, no custodian signature required;
- the app holds no wallet keys — it never has custody at any point.

## Mitigations by risk

| Risk | Mitigation |
|---|---|
| CSRF on state-changing endpoints | cookie is `httpOnly`, `SameSite=Lax`; API is fetch-only, CORS not enabled cross-origin |
| Brute-forcing logins / API abuse | global rate limit (240 req/min) via `@fastify/rate-limit`; tighter budget feasible per-IP |
| XSS | React (no `dangerouslySetInnerHTML`); `@fastify/helmet` CSP: `script-src 'self'`, `img-src 'self' data:`, no inline scripts |
| Payload abuse | `bodyLimit` 64 KB; zod-style manual validation on all inputs (amount ranges 1 000–5 000 000 XOF, string caps, enum checks) |
| JWT forgery | HMAC-SHA256 with server secret, 12 h expiry, `timingSafeEqual` verification |
| PII leakage | student names masked to initials in Nostr receipts; no phone numbers in logs; SMS bodies contain amounts/names only (documented) |
| Preimage leakage (double-spend trick) | preimages live only in the app DB, revealed to the school node at settle; single-use by construction (hash-bound) |
| Invoice substitution | `payment_hash` is generated per fee, stored at creation, and the settle path only accepts the DB row's preimage |
| Relay spam | embedded Nostr relay signature-checks every EVENT (`verifyEvent`), ignores invalid; in-memory cap by design of demo |
| Secret handling | all secrets via env vars; `.env.example` documents every one; demo JWT secret clearly marked `change-me` |
| Supply chain | 6 runtime deps, all mainstream (fastify, better-sqlite3, nostr-tools, ws, @fastify/*); `package-lock.json` committed |

## Demo-vs-production (explicit trade-offs)

The hackathon build optimizes for **reproducibility and one-command setup**;
the following shortcuts are deliberate and documented:

1. **`--no-macaroons` on LND** — regtest-only nodes on an isolated docker
   network. Production: per-school macaroons with `invoices:write` only.
2. **TLS verification disabled** to self-signed LND certs inside the compose
   network. Production: internal CA or gRPC over unix sockets.
3. **Demo login personas** instead of phone OTP. Production: SMS/WhatsApp OTP
   (Twilio / Orange SMS API) — the notification layer already abstracts this.
4. **School Nostr private keys in SQLite** — demo convenience. Production:
   keys in the school's own LND node keystore or an HSM-backed signing service.
5. **Fixed XOF/sats rate** — no market risk in regtest. Production: rate feed
   with a slippage margin and explicit user confirmation.

## What an attacker with the app server gets

- read/write access to fee records (DoS, fake fee rows) — **but not the money**:
  no keys, no macaroons in production, HTLCs enforce the amounts;
- ability to cancel invoices → triggers **refunds**, not theft;
- ability to create invoices → school confirms only real enrolments;
  parents only pay invoices tied to real students they know.

This is the design goal: compromise of the coordinator degrades service, it
does not create loss of funds.

## Incident notes

- All state transitions are logged (`wallet_events`, `payments`, `notifs`) —
  a full audit trail per fee.
- The smoke test asserts the invariant that matters most:
  *balance only moves on settle; refunds are automatic*.
