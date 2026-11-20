# Jàngal — 3-minute demo video script

**Format**: screen recording (phone-size window 390×844 for the PWA, then the
terminal for the one-command setup). Speak French or English; show Wolof UI at
least once. Target: 2:45–3:00.

---

### 0:00 — The problem (hook, no screen or a Dakar market photo)

> "In Senegal, school fees are the biggest family expense after food — and a
> huge part is paid by the diaspora, in Paris, Milan or New York. Today that
> money travels through middlemen and cash. Receipts can be faked. Money sent
> for school doesn't always become school."

### 0:25 — One-command setup (terminal)

```bash
git clone … && cd jangal && docker compose up --build
```

> "Jàngal boots a full Bitcoin stack: bitcoind, two Lightning nodes, and the
> app. One command. The channel between the diaspora parent and the school is
> opened and confirmed automatically."

(show the seeded logs scrolling: wallet created → channel opened → fee created)

### 0:50 — The school creates the fee (browser, school persona)

Login as **École Mame Diarra Mbaye** (code 3333).

> "The school creates the fee invoice. Or it just pastes the fee note —
> Jàngal's AI reads it: student, class, term, amount in CFA francs."
>
> (paste the sample note, click ✨ IA, fields fill, create)

Point out: the amount shows **45 000 F ≈ 52 941 sats** — both currencies.

### 1:20 — The diaspora parent pays (switch persona, parent)

Login as **Ousmane Diop** (1111). Show the fee card → **⚡ Payer maintenant**.

> "Ousmane pays from Paris. And here is the heart of Jàngal: the money is now
> **locked** on Lightning. Not in our app — in an HTLC. The school can't take
> it yet, Ousmane can't get it back yet. It can only become Mariama's school
> fees, or come back home."

Show the amber "Fonds verrouillés" state + the hint that it auto-refunds.

### 1:50 — Proof + AI verification (the wow moment — switch persona, school)

On the locked fee: **📷 Joindre le justificatif** → pick the receipt photo.

> "Before confirming, the school photographs the enrolment receipt. Our AI
> vision checks it against the fee record — school, student, class, term,
> amount. Conforme, ninety percent. And look: the photo's SHA-256 is going
> into the receipt. The diaspora parent in Paris will verify the *exact*
> evidence, not a promise."

Show the verdict panel: "✅ IA : justificatif conforme (90%)", checks list,
sha256. Then **✅ Confirmer la scolarisation**.

> "One tap — the hold invoice settles, the school is paid in seconds. A
> **Nostr receipt** is signed by the school's key with the proof hash and AI
> verdict inside. Even if Jàngal disappears, that proof stays verifiable."

Show the receipts page: "✔ Reçu authentique (signature Nostr valide)",
student masked to "M. D." — proof without exposing children's data.

### 2:20 — The family in Dakar (switch persona, family — in WOLOF)

Switch the language pill to **WO**. Login as **Aïda Diop** (2222).

> "Aïda, the grandmother in Dakar, sees it in Wolof on her phone — and gets
> the SMS we'd send through a local gateway."

Show notifications + SMS simulation panel in Wolof.

### 2:40 — Rejection & timeout = automatic refund (back to school, fast)

Create a second fee → pay → **↩️ Rejeter**. Then once more → pay →
**⏱ Simuler l'expiration**.

> "And if a school never confirms? Reject — refunded. Or the hold invoice
> simply expires — the HTLC fails, the money returns to Paris **automatically**.
> No support ticket, no custodian. That's the Lightning network doing escrow."

### 2:55 — Close

> "Jàngal — money that can only become education. Fees on Lightning,
> receipts on Nostr, Wolof in the UI. Built for Senegal, open source, one
> command to run. Jërëjëf!"

---

## Recording checklist

- [ ] `docker compose up --build` from clean state (volumes pruned) — first boot ~2-3 min; record the seeding log lines, cut the wait
- [ ] Mobile viewport (390×844) — judges score "mid-range phones" UX
- [ ] Show WO / FR / EN switch once
- [ ] Show the QR invoice (any wallet can pay it)
- [ ] **Show the AI proof verdict panel in full — it is the differentiator**
- [ ] Show the receipt detail with the anchored proof hash + photo
- [ ] Terminal visible for the one-command start
- [ ] End on the receipts page (signature valid badge)
- [ ] Upload 1080p, add subtitles (FR + EN)
