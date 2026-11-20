# Devpost submission text (copy-paste ready)

## Title

**Jàngal — School fees on Lightning: money that can only become education**

## One-liner

Frais de scolarité verrouillés sur le Lightning Network : la diaspora paie,
les fonds restent bloqués dans un HTLC, et ne sont versés à l'école que
lorsqu'elle confirme la scolarisation — sinon remboursement automatique.
Reçus signés sur Nostr. UI en wolof, français et anglais.

## Description

### The problem

In Senegal, education is the largest family expense after food, and a huge
share of school fees is paid by the diaspora (23% of households receive
remittances; traditional transfers cost 7–10%). Today that money travels
through middlemen and cash. Receipts can be faked. Money sent "for school"
does not always become school.

### The solution

**Jàngal** (Wolof: "to educate") is a purpose-locked payment rail:

1. **The school creates the fee invoice** — or pastes the fee note and our AI
   parses student, class, term and amount (FCFA and sats both shown).
2. **The diaspora parent pays in sats** — funds are locked in a **Lightning
   hold invoice** (HTLC). Nobody can claim them yet.
3. **The school attaches proof and confirms** — it photographs the enrolment/
   fee receipt; our **AI vision verifies it against the fee record** (school,
   student, class, term, amount ±5%); one tap settles the invoice and the
   school is paid in seconds.
4. **A Nostr-signed receipt is published** (kind 30078) — verifiable forever
   by anyone. It anchors the **sha256 of the proof photo and the AI verdict**,
   with student names masked to initials for privacy. Evidence, escrow and
   receipt form one closed loop.
5. **If the school never confirms** — the HTLC fails and the money returns to
   the parent **automatically**. Escrow by Lightning math, not by a custodian.

### What's real (regtest, one command)

- Full stack: bitcoind + 2 LND nodes + Fastify app — `docker compose up --build`
- Real hold-invoice lifecycle: `AddHoldInvoice` → payment locked →
  `SettleInvoice` / `CancelInvoice` with automatic refunds
- **AI-verified proof photos**: upload → vision verdict (match/mismatch/
  unclear + named checks) → hash + verdict anchored in the Nostr receipt
  (deterministic mock provider offline, any OpenAI-compatible vision model
  via one env var)
- Real Nostr: school keys, signed receipt events, **embedded relay** (ws://…/nostr),
  signature verification in the UI
- **Public receipt verifier** (`/#/verify/<fee_id>`, no login): anyone — the
  family in Dakar, the parent in Paris, the school inspector — can check the
  whole trust chain: Nostr signature → school's registered key → Lightning
  payment hash → fee settled → AI-evidence hash anchored → **photo re-hashed
  live to prove it was never swapped after settlement**. The page re-checks
  itself every 5 s — swap the photo behind it and an open verifier turns red
  by itself. Shareable on WhatsApp.
- **School secretariat KPIs**: median lock→settle time, refund rate, AI-proof
  coverage, per-term totals, and one-click **CSV ledger export** for accounting
- Lightning wallet implementation for both sides (parent & school nodes,
  BOLT11 QR payable by any wallet)
- AI: fee-note parsing + trilingual (wo/fr/en) assistant — deterministic mock
  provider by default, any OpenAI-compatible LLM via env vars
- Live composed FX rate (mempool.space × XOF peg) with offline fallback
- PWA, mobile-first, **~70 KB gzipped**, no external fonts/assets — built for
  low bandwidth and mid-range Androids
- **148 automated checks + a 13-step browser journey, all passing** (`make
  test`): unit suite (conversions,
  i18n parity wo/fr/en, JWT tamper/expiry, Nostr forge attempts, hold-invoice
  lifecycle), smoke E2E (full money path), and an extended E2E suite covering
  RBAC matrix, auth bypass, illegal state transitions, **concurrent
  confirm+reject races (exactly one wins, no 500s)**, **evidence-photo swap
  detection**, XSS inertness, security headers, relay forgery rejection,
  rate limiting and a parallel load burst — plus a Playwright journey walking
  the whole product loop in a real browser with API-state assertions after
  every click — docs/test-report.md

### Wolof first

The UI ships in **Wolof, Français and English**. Family notifications are
drafted in Wolof (with a simulated SMS gateway panel — the integration point
for Orange SMS API is one adapter away).

### Impact

One Dakar private school of 300 students moves ≈ 40 M FCFA/year in fees.
Parents save 7–10% versus money-transfer operators; schools settle instantly
with a reconciliation ledger; families hold receipts nobody can forge.
Metrics tracked live in-app: sats-for-education, fees settled/refunded,
time-to-confirmation. Sources in docs/impact.md.

### Security by design

- The app **never holds funds or wallet keys** — money moves only as HTLCs
  between the parent's and school's Lightning nodes
- Compromise of the server degrades service; it cannot redirect money
  (settle only with the fee-bound preimage; cancel only triggers refunds)
- **Tamper-evident evidence**: swapping the proof photo after settlement breaks
  the sha256 chain and the public verifier turns red (tested live)
- Full threat model: docs/threat-model.md (CSRF, XSS/CSP, rate limits,
  preimage binding, PII masking, demo-vs-production trade-offs documented)

### Team

- Raed Jemli — Tunisia

### Built with

Bitcoin (regtest), LND hold invoices, Nostr (nostr-tools, NIP-01/30078,
embedded relay), Fastify, SQLite, React PWA (Vite), AI (OpenAI-compatible
adapter: GLM/GPT/Groq or deterministic mock), Docker Compose.

### Links

- Repo: https://github.com/imspsycho/jangal
- Live demo: see DEPLOY.md (Render one-click via render.yaml, LND_MODE=mock) or `docker compose up` for the real bitcoind + LND regtest stack
- Video: https://youtu.be/fGDln6mZ5yo (3-min demo, includes the live tamper-detection beat)

## Submission checklist (before Nov 20, 8:00 PM UTC)

- [ ] Public GitHub repo (rules require it) — MIT LICENSE, README
- [ ] MVP accessible online (hosted demo) or demo video (both if possible)
- [ ] Presentation: this text + video
- [ ] Team members added on Devpost (students residing in Africa)
- [ ] Like/comment on other projects (community goodwill, and 2025 winners
      correlated with community engagement)
- [ ] Post the project in the hackathon Discord/WhatsApp + X with a 30-sec clip
