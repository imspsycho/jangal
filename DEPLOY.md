# Jàngal — Deployment guide (10 minutes, free)

Two ways to run Jàngal. **Both are the same code**: the Docker path runs
against real bitcoind + LND regtest nodes; the hosted path runs the same
hold-invoice state machine in `LND_MODE=mock` simulation.

| Path | What judges get | Effort |
|---|---|---|
| **A. Hosted demo (Render free)** | A clickable live URL in 10 min | ~10 min |
| **B. Docker locally** | Real Lightning regtest stack, one command | `docker compose up --build` |

Submit BOTH links on Devpost: hosted URL as "Try it out", docker command in
the README. The video (see `docs/demo-video-script.md`) should show the
Docker path boot + the hosted URL working.

---

## A. Hosted demo on Render (free tier)

1. Push this repo to **your** GitHub (public).
2. Go to https://render.com → **New → Web Service** → connect the repo.
3. Render reads `render.yaml` automatically — just confirm:
   - Root directory: `backend` (from render.yaml)
   - Build: `npm ci` · Start: `npm start` · Plan: **Free**
4. Click **Create Web Service**. First deploy ≈ 3–5 min.
5. Your demo is live at `https://jangal-xxxx.onrender.com`.
6. Verify: `https://jangal-xxxx.onrender.com/api/health` → `{"ok":true,...}`,
   then log in with persona code `1111` / `3333` / `2222`.

Notes:
- Free-tier instances sleep after 15 min idle — the first click takes ~30 s
  to wake. If a judge reports a cold start, that's why (mention it in the
  submission: "free-tier demo, first load may take a few seconds").
- Data (SQLite) is ephemeral on free tier — it re-seeds on every boot, which
  is exactly what a demo wants.
- Optional: set `AI_PROVIDER=openai-compatible` + `AI_BASE_URL` + `AI_MODEL`
  + `AI_VISION_MODEL` + `AI_API_KEY` env vars to switch the AI layer (parser,
  assistant, proof vision) from deterministic mock to a real model.

### Alternatives that also work
- **Railway**: same steps, reads `render.yaml` fields manually
  (`npm ci` / `npm start`, root `backend`, env `LND_MODE=mock`).
- **Fly.io**: `fly launch` in repo root (Dockerfile.app builds the same image
  as compose without the LND sidecars; set `LND_MODE=mock`).

## B. Full Lightning stack locally (the "one command" demo)

```bash
git clone https://github.com/<you>/jangal && cd jangal
docker compose up --build
# → http://localhost:3000   (bitcoind + lnd-school + lnd-parent + app)
```

First boot mines regtest blocks and opens the parent→school channel
automatically (~2–3 min). Demo personas: `1111` parent · `3333` school ·
`2222` family.

## Pre-submission checks (5 min)

```bash
curl -s https://<your-demo>/api/health          # {"ok":true}
cd backend && node src/smoke.js https://<your-demo>   # 21/21 must pass
```

Both commands green → submit `docs/devpost-submission.md` text + video link.
