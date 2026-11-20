# Jàngal — Impact & metrics

## Why school fees?

| Fact | Value | Source |
|---|---|---|
| Senegalese households receiving remittances | 23% (2019) | UNCDF, "Switching from Cash to Digital Remittances" |
| Remittances to Senegal | ≈ US$2.9 B/yr (≈10% of GDP range in recent years) | World Bank / UN OSAAs policy brief |
| Cost of traditional transfers (sub-Saharan Africa corridors) | 7–10% | World Bank Remittance Prices Worldwide |
| Orange Money + Western Union share of digitized remittances (2023) | 45% of flows | UN OSAAs, "Remittances as a Catalyst for Financial Inclusion in Africa" |
| Private-school enrollment share in Senegal | ≈ 1 in 4 students | UNESCO UIS (regional average; West & Central Africa among highest globally) |
| Fee payment frequency | 3× per school year, per child, mostly in cash | standard Senegalese school calendar (trimestres) |

Education is the **largest discretionary family expense after food**, and for
diaspora-funded households it is the payment that *must not fail*. Yet today it
moves through cash, middlemen and screenshots of receipts.

## What Jàngal changes

| Metric | Traditional corridor | Jàngal (Lightning) |
|---|---|---|
| Cost per fee payment | 7–10% (MTO) or cash-handling risk | < 0.01% (measured on regtest: ~1 sat fee per ~53 000-sat payment) |
| Time to reach the school | minutes–days | seconds (settled on confirmation) |
| Proof of purpose | none / paper receipt | Nostr-signed receipt, verifiable by anyone |
| Fraud surface (fake receipts, skimmed fees) | high | cryptographic (preimage-bound) |
| Failure mode | money lost / diverted | automatic refund to sender |

## Metrics we track (built into `/api/impact`)

- fees settled / locked / refunded (count + sats + XOF)
- sats-for-education (total settled)
- schools onboarded
- refund rate (target: near-zero after school onboarding)
- time-to-confirmation (settle latency, target < 1 min)

The dashboard shows them live during the demo.

## Reach estimate (illustrative)

One Dakar private school of 300 students × 3 terms × ~45 000 F ≈
**40 M FCFA/year** moving through a single school. Replacing even the fee
collection of 10 schools ≈ 400 M FCFA/year (~US$650k) of payments where:

- parents in the diaspora save 7–10% vs money-transfer operators,
- schools get instant settlement and a reconciliation ledger,
- families get receipts nobody can forge.

## Rate derivation (demo)

`RATE_XOF_PER_SAT = 0.85` assumes a BTC price near US$130k and the CFA franc
peg (1 USD = 655.957 XOF):

- 1 BTC = 130 000 × 655.957 ≈ 85.3 M XOF
- 1 sat = 85.3 M / 100 M ≈ **0.85 XOF**

The rate is configurable (`RATE_XOF_PER_SAT`) and shown on every amount in the
UI so judges can reproduce the math. In production: rate feed + slippage
margin, confirmed by the sender before payment.

## Sources

- UNCDF migrantmoney.uncdf.org — digital remittances research (Senegal / Wizall)
- UN Office of Special Adviser on Africa, *Remittances as a Catalyst for
  Financial Inclusion in Africa* (2026)
- World Bank, Remittance Prices Worldwide (quarterly)
- UNESCO Institute for Statistics, private enrollment shares
