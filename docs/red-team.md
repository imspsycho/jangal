# Jàngal — Red Team Review

*An adversarial critique of our own submission, written before the judges can
write it. Every reason Jàngal might NOT win 1st place at the Dakar Bitcoin
Hack 2026, rated and answered. Nothing here is hidden from the judges: the
"real vs simulated" table in the README covers the same facts.*

Severity: **🔴 could cost the win** · **🟡 judge-visible weakness** · **🟢 accepted trade-off (documented)**

---

## R1. "The AI proof verdict in the hosted demo is a mock — is the AI real?"

**Severity: 🔴 → mitigated.**
The default provider is deterministic (`mock`) so the demo is offline-reproducible
and never fails during judging. A skeptic could call the 90% verdict theater.
**Mitigation done:** the verdict panel and API label the model explicitly
(`model: mock`), the code path to a real vision model is one env var
(`AI_PROVIDER=openai-compatible`, `AI_VISION_MODEL`), and the prompt/checks
contract is implemented and tested. **Residual risk:** judges who only try the
hosted demo see mock verdicts. **Recommendation before submitting:** if a
vision API key is available, deploy one instance with the real model ON and
link it as "AI-live demo" (the same code, env-var swap). If not, the video
should show the `model:` label honestly and explain the deterministic default
as a reliability choice.

## R2. Sésame's escrow is equally deep, and they have 144 tests vs our 21

**Severity: 🔴 → 🟢 (resolved on Nov 20).**
Sésame (COD escrow, hold invoices, NWC, 144 automated tests) is the strongest
rival and overlaps our escrow core. If judges score purely on escrow
engineering depth, they can win.
**Why we still win the overall decision:** (a) we don't compete on the same
problem — school fees paid by the diaspora is a **bigger, more emotionally
local** money flow than COD logistics; (b) our escrow closes a loop theirs
leaves open: **AI-verified evidence anchored in the receipt** — Sésame lists
diaspora support as *future work*, we ship the diaspora use case; (c) we run
a real bitcoind + 2×LND stack in one command, not just wallet-side NWC;
(d) **test-count gap closed and overtaken: 148 automated checks + a 13-step
browser-level journey (real Chromium, hard API assertions after every click)
vs their 144** — and ours go
further than state transitions: RBAC matrix, auth-bypass attempts, concurrent
confirm+reject races (exactly one wins), **live evidence-photo swap detection
through the public verifier (an open page turns red by itself ≤5 s after a
swap)**, relay forgery rejection, rate-limit and load
behaviour (docs/test-report.md). **Action:** the pitch line is now "148
automated checks including adversarial ones, plus a full browser journey —
we tested how it fails, not just that it works."

## R3. Popular Choice is already lost (CircleSats ~22 votes)

**Severity: 🟡 accepted.**
Public voting opened 10 days ago; CircleSats and the tontine cluster have
community campaigns we cannot and should not (ToS: no vote tampering) catch.
**Decision:** optimize for the judged 1st/2nd/3rd places; treat Popular Choice
as unwinnable. Posting the project in the hackathon Discord/X with a 30-second
clip is still worth 15 minutes for goodwill.

## R4. One-person team

**Severity: 🟡.**
Judges may probe whether the builder understands the Senegalese context.
**Mitigation done:** the product *is* the context — Wolof UI, FCFA amounts,
Francophone class levels (CI…Tle), Médina school persona, tontine-adjacent
family dynamics, Wolof SMS drafts. **Action for the submitter:** record the
demo voice-over in French, show the Wolof UI beat, and be ready to answer
"why school fees?" with the remittance story (diaspora = ~23% of households;
education = top family expense after food — sources in docs/impact.md).

## R5. The fiat leg (XOF in/out) is simulated — "Bitcoin-only schools don't exist"

**Severity: 🔴 but shared by every competitor.**
Every project in this hackathon has a fiat boundary somewhere (Sésame's Mobile
Money leg is simulated too). Ours is explicit and honest: parents hold sats,
schools receive sats, the XOF figure is a display rate (with a live composed
oracle now). **Mitigation done:** "real vs simulated" table in the README;
Mobile Money partner is named as the production path (the same slot as the
SMS gateway adapter). **Framing for judges:** we solve the *enforcement* leg
(purpose-locked escrow + verifiable evidence) — the fiat leg is a partnership,
not an invention.

## R6. Hold-invoice UX in production: funds locked for up to expiry (1 h)

**Severity: 🟢 documented.**
`FEE_EXPIRY_SECONDS=3600` is a demo value. In production, expiry would be
days (school confirmation is not instant) — hold invoices across that horizon
carry routing-fee and liquidity costs on mainnet. **Mitigation:** the timeout
is configurable; the demo's ⏱ button exists precisely to show we understand
the expiry path. **Residual:** judges from BTrust engineering will know this —
the honest framing is "timeout chosen per corridor; on mainnet this becomes a
policy per school (e.g. 24–48 h) with fee accounting".

## R7. School Nostr private keys live in SQLite (demo)

**Severity: 🟢 documented.**
threat-model.md lists this as a demo shortcut with the production answer
(school-held keystore / HSM). Because the key only signs *receipts* (not
money), the blast radius is forged receipts — and receipts are cross-checkable
against the payment hash on the school's node.

## R8. Regtest + no macaroons + TLS verification off

**Severity: 🟢 documented.**
Standard demo posture; all three are listed in the threat model with
production fixes. Judges at a Bitcoin hackathon will recognize the pattern —
what matters is that we *documented* it instead of hiding it.

## R9. "AI could be fooled by a fake receipt photo"

**Severity: 🟡.**
A sophisticated school could print a fake receipt. **Answer (by design):**
the AI is an **auditor, not an authority** — it never moves money. The
escrow already guarantees the school only gets paid after *it* confirms;
the proof layer makes that confirmation *attributable* (image hash anchored
in a signed Nostr event). If a dispute arises, the anchored hash proves
exactly which photo the school swore by. Forged-photo detection then becomes
a model-quality arms race — out of scope for escrow, in scope for roadmap
(cross-checking against the ministry's fee schedule, repeated-photo
detection via hash history).

## R10. Bundle is React (68 KB gz) — Sésame ships Preact at ~40 KB

**Severity: 🟢.**
Both are far below the "fast on 2G/3G" bar (first paint under 1 s on a
mid-range Android). The gap (28 KB) is one invoice image. No action.

## R11. No real users / no pilot school

**Severity: 🔴 shared by the entire field.**
No competitor has real-user validation (the top projects all say "not yet
tested with users"). **Action:** do not overclaim. The submission says
"designed with the fee-collection flow of a Dakar private school in mind;
pilot is the next step", not "used by schools".

## R12. Deadline risk: submission window is hours, not days

**Severity: 🔴 process risk.**
Everything must be live before **Nov 20, 2026, 20:00 UTC**: repo pushed
(public), hosted demo deployed and smoke-tested, video uploaded (YouTube
unlisted or Loom), Devpost text pasted, team member added.
**Mitigation:** minute-by-minute submission checklist with buffer time;
of 90 minutes before the deadline; Devpost "submit" button pressed early —
edits are allowed until the deadline, late submissions are not.

## R13. Scope criticism: "this is just one school fee use case"

**Severity: 🟡.**
Deliberate. The rails we built (purpose-locked hold invoices + proof anchors
+ Nostr receipts) generalize (rent, clinics, tontines), but the pitch wins by
being **the** solution for one painful, universal, recurring flow. The
submission should say this in one line: "school fees first — the
purpose-locked rail generalizes to any earmarked family payment."

## R14. Eligibility scrutiny of the team composition

**Severity: 🔴 process risk.**
Rule: participants must reside in Africa; the submitting team complies.
**Action:** only add Devpost team members who reside in Africa, and keep the
team page accurate. The prize (sats) goes to the submitting participant.

---

## Pre-mortem summary — if we lose, the most likely causes in order

1. A judge personally prefers merchant/POS tools used *inside* Dakar over a
   diaspora-facing tool (taste risk — countered by the emotional pitch and
   the "family in Pikine" beat in the video).
2. We failed to get the live demo/video link in front of judges before the
   deadline (process risk — checklist mitigates).
3. Sésame-style depth scoring where test count outweighs product breadth
   (countered in R2 framing).
4. Mock-AI skepticism (R1) — deploy the AI-live variant if a key exists.

**Overall red-team verdict:** no disqualifying weakness; three judge-visible
risks (R1, R5, R11) are shared by the whole field and explicitly documented;
process risks (R12, R14) are fully controllable. Ship it.
