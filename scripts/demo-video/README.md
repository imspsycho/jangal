# demo-video — reproducible 3-minute demo video

The submitted video (`docs/demo-video.mp4`) is not a hand-recorded screen
capture: it is **directed and rendered by code**, end to end, from a fresh
instance of the app. Every state it shows is real (API-verified at record
time), including the live tamper detection on the public verifier.

```
wrapper.html/css/js   1920×1080 "studio" stage: phone frame (iframe), caption
                      panel, terminal replay, title cards — served by the app
                      itself (copy into backend/public/)
director.py           Playwright director: boots a fresh instance (mock LND),
                      walks the full product loop in a real browser, records
                      1080p video, writes timeline.json. 19 API-verified checks
                      must pass or the take is aborted.
post.py               ffmpeg assembly: voiceover clips at exact scene offsets,
                      synthesized ambient bed, loudnorm −16 LUFS, H.264 MP4.
gen-vo.sh             voiceover generation (TTS) — 11 narration clips
gen-receipt.py        the enrolment-receipt photo used in the AI-evidence scene
```

## Reproduce it

```bash
# 1. app running (any mode) on :3130 — or edit BASE in director.py
cd backend && DATA_DIR=/tmp/jangal-video-data LND_MODE=mock PORT=3130 npm start

# 2. copy the studio into the served frontend, then rehearse (fast, no recording)
cp scripts/demo-video/wrapper.* backend/public/
cd scripts/demo-video && REHEARSE=1 python3 director.py

# 3. real take → recording/*.webm + timeline.json
python3 director.py

# 4. voiceover (11 clips, ~3 min) + final render → docs/demo-video.mp4
./gen-vo.sh && python3 post.py
```

What the director records, scene by scene (all API-verified):

| # | Beat | Verified |
|---|------|----------|
| 1 | Title card — the problem | — |
| 2 | `make demo` terminal (real seed logs) | instance boots |
| 3 | School pastes fee note → ✨ IA parses class/term/amount | amount=45000, term=T2 |
| 4 | Parent (Paris) pays → hold invoice | fee `locked` |
| 5 | School uploads receipt photo → AI verdict 90% → confirm | fee `settled` |
| 6 | Nostr receipt, masked student, WhatsApp share | signature valid |
| 7 | Public verifier (no login) → green → **file swapped on disk → red LIVE** | tamper ≤5 s |
| 8 | File restored → green again → family UI in Wolof | re-verify ok |
| 9 | Reject → refund · expiry → auto-refund · parent notified | `refunded` ×2 |
| 10 | Impact counters | — |
| 11 | Outro — 148 tests, open source | — |

The tamper beat is genuine: `director.py` swaps
`$DATA_DIR/proofs/<fee>.png` behind the browser's back and the open verifier
page flips red on its own 5-second re-check — no refresh, no camera cuts.
