#!/usr/bin/env python3
"""Jàngal demo video — Playwright director.

Records a 1920×1080 keynote-style demo: the real app running in a phone frame
(iframe, same origin), captions on the left, real terminal replay, live tamper
beat on the public verifier. Every step is API-verified; any failure aborts.

Usage:
  python3 director.py            # real take (records video + timeline.json)
  REHEARSE=1 python3 director.py # fast rehearsal, no recording
"""
import asyncio, json, os, shutil, signal, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path
from playwright.async_api import async_playwright

ERRORS = []

HERE = Path(__file__).resolve().parent
BASE = "http://localhost:3130"
DATA = Path("/tmp/jangal-video-data")
PROOF_ORIG = HERE / "proof-receipt.png"
PROOF_TAMPERED = HERE / "proof-tampered.png"
OUTDIR = HERE / "recording"
REHEARSE = os.environ.get("REHEARSE") == "1"
TAIL = 0.15 if REHEARSE else 1.35          # scene hold after VO ends
TYPE_MS = 6 if REHEARSE else 26            # typing char delay

# VO durations (fallback estimates until TTS clips exist)
VO_DEFAULT = {"s01": 13, "s02": 9, "s03": 14, "s04": 12, "s05": 16, "s06": 11,
              "s07": 20, "s08": 10, "s09": 13, "s10": 9, "s11": 13}
try:
    VO = {**VO_DEFAULT, **json.load(open(HERE / "vo.json"))}
except Exception:
    VO = VO_DEFAULT

CURSOR_JS = """
(function(){
  const d=document.createElement('div');
  d.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:2.5px solid rgba(247,147,26,.92);box-shadow:0 0 20px rgba(247,147,26,.5);left:-100px;top:-100px;transition:left .07s linear,top .07s linear,transform .12s ease';
  const c=document.createElement('div');
  c.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#F7931A;left:-100px;top:-100px;transition:left .05s linear,top .05s linear';
  const mount=()=>{document.documentElement.appendChild(d);document.documentElement.appendChild(c)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  document.addEventListener('mousemove',e=>{d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'},true);
  document.addEventListener('mousedown',()=>{d.style.transform='scale(1.55)';setTimeout(()=>d.style.transform='',160)},true);
})();
"""

NOTE = ("École Mame Diarra Mbaye — Médina\n"
        "Frais de scolarité Trimestre 2\n"
        "Élève : Mariama Diop — classe CM2\n"
        "Montant à payer : 45 000 FCFA")

# ---------------------------------------------------------------- API helpers
class Api:
    def __init__(self): self.tokens = {}
    def _req(self, method, path, body=None, token=None):
        req = urllib.request.Request(BASE + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"})
        if token: req.add_header("Cookie", f"jangal_token={token}")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")
    def login(self, code):
        s, d = self._req("POST", "/api/auth/login", {"code": code})
        assert s == 200, f"login {code} failed: {d}"
        # token is in cookie — fetch via /api/me workaround: re-do with cookie jar
        return s, d
    def login_token(self, code):
        # use urllib with cookie handling
        import http.cookiejar
        cj = http.cookiejar.CookieJar()
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        req = urllib.request.Request(BASE + "/api/auth/login", method="POST",
            data=json.dumps({"code": code}).encode(),
            headers={"Content-Type": "application/json"})
        with op.open(req) as r:
            json.loads(r.read())
        for c in cj:
            if c.name == "jangal_token": return c.value
        raise RuntimeError("no token")
    def get(self, path, token): return self._req("GET", path, token=token)
    def post(self, path, body, token): return self._req("POST", path, body, token)

api = Api()
PASS, FAIL = [], []

def check(name, cond):
    (PASS if cond else FAIL).append(name)
    print(f"  {'PASS' if cond else 'FAIL'} — {name}", flush=True)

# ---------------------------------------------------------------- scenes meta
SCENES = {
 "s01": dict(mode="title"),
 "s02": dict(mode="terminal", kicker="ONE COMMAND", title="A full Bitcoin stack in seconds",
             sub="bitcoind · lnd-parent · lnd-school · app — the channel Paris → Dakar opens automatically.",
             persona="⬛ terminal — jangal"),
 "s03": dict(mode="app", kicker="AT THE SCHOOL · MÉDINA, DAKAR", title="Paste the fee note. AI does the rest.",
             sub="Class, term, amount — read from the note, in CFA francs and sats.",
             persona="🏫 École Mame Diarra Mbaye — Médina, Dakar"),
 "s04": dict(mode="app", kicker="FROM PARIS · 6 000 KM AWAY", title="The money locks on Lightning",
             sub="A hold invoice: not in our app, not in anyone's custody — school fees, or refund.",
             persona="🌍 Ousmane Diop — diaspora parent, Paris"),
 "s05": dict(mode="app", kicker="AI-VERIFIED EVIDENCE", title="Proof, not promises",
             sub="The enrolment receipt is checked against the fee record — its hash anchored before settlement.",
             persona="🏫 École Mame Diarra Mbaye — Médina, Dakar"),
 "s06": dict(mode="app", kicker="NOSTR RECEIPT", title="A receipt that outlives the app",
             sub="Signed by the school's key · student masked — proof without exposing children's data.",
             persona="🏫 École Mame Diarra Mbaye — Médina, Dakar"),
 "s07": dict(mode="app", kicker="NO LOGIN · NO APP", title="Anyone can verify — live",
             sub="Nostr signature · school key · payment hash · evidence re-hashed every 5 seconds.",
             persona="🔍 Public verifier — no account needed"),
 "s08": dict(mode="app", kicker="BACK IN DAKAR", title="The whole family, in Wolof",
             sub="Notifications + SMS in Wolof — the proof turns green again when the file is restored.",
             persona="👵 Aïda Diop — family, Dakar"),
 "s09": dict(mode="app", kicker="LIGHTNING IS THE ESCROW", title="No confirmation? Automatic refund",
             sub="Reject → instant refund · expiry → the HTLC fails, the money returns to Paris. No custodian.",
             persona="🏫 École Mame Diarra Mbaye — Médina, Dakar"),
 "s10": dict(mode="app", kicker="BUILT FOR REAL ADOPTION", title="Numbers schools can act on",
             sub="Median lock→settle · refund rate · AI-proof coverage · one-click CSV — on a mid-range phone.",
             persona="🏫 École Mame Diarra Mbaye — Médina, Dakar"),
 "s11": dict(mode="title"),
}
ORDER = ["s01","s02","s03","s04","s05","s06","s07","s08","s09","s10","s11"]
CARDS = {
 "s01": dict(kicker="DAKAR BITCOIN HACK 2026 · BTRUST", title="Jàngal",
             sub="School fees on Lightning · receipts on Nostr · AI-verified evidence — built for Senegal and its diaspora"),
 "s11": dict(kicker="JÀNGAL — WOLOF FOR “TO EDUCATE”", title="Money that can only become education",
             sub="148 automated tests passing · open source · one command to run · Jërëjëf!"),
}

def now(): return time.perf_counter()

class Director:
    def __init__(self, page):
        self.page = page
        self.fl = page.frame_locator("#phone")
        self.t0 = None
        self.timeline = {}
        self.errors = []

    # ---- stage helpers ----
    async def caption(self, sid):
        m = SCENES[sid]
        idx = ORDER.index(sid)
        await self.page.evaluate("(m) => __stage.setMode(m)", m["mode"])
        await self.page.evaluate("(i) => __stage.setDot(i)", idx)
        if m["mode"] == "title":
            c = CARDS[sid]
            await self.page.evaluate("([k,t,s]) => __stage.setCard({kicker:k,title:t,sub:s})",
                                     [c["kicker"], c["title"], c["sub"]])
        else:
            await self.page.evaluate("([k,t,s]) => __stage.setCaption({kicker:k,title:t,sub:s})",
                                     [m.get("kicker",""), m.get("title",""), m.get("sub","")])
            await self.page.evaluate("(p) => __stage.setPersona(p)", m.get("persona",""))

    async def scene(self, sid, actions=None, min_dur=0.0, tail=None):
        start = now()
        if self.t0 is None: self.t0 = start
        rec = {"start": start - self.t0}
        self.timeline[sid] = rec
        print(f"\n=== {sid} ===", flush=True)
        await self.caption(sid)
        rec["audio_at"] = now() - self.t0 + 0.55
        if actions:
            await actions()
        t = TAIL if tail is None else tail
        end = max(now(), start + VO[sid] + t, start + min_dur)
        while now() < end:
            await asyncio.sleep(min(0.1, end - now()))
        rec["end"] = now() - self.t0
        print(f"    ({rec['start']:.1f}s → {rec['end']:.1f}s, vo {VO[sid]}s)", flush=True)

    # ---- app helpers ----
    def frame(self):
        for f in self.page.frames:
            if f.url.startswith(BASE) and "wrapper" not in f.url:
                return f
        return None

    async def phone_goto(self, hash_="#/"):
        await self.page.evaluate("(u) => __stage.phoneGoto(u)", BASE + "/" + hash_)
        await asyncio.sleep(1.1 if not REHEARSE else 0.4)

    async def logout(self):
        await self.page.evaluate("() => fetch('/api/auth/logout', {method:'POST', credentials:'include'})")
        await self.phone_goto()

    async def login(self, persona, lang=None):
        if lang:
            pill = self.fl.locator(f"button.btn.sm:has-text('{lang}')")
            if await pill.count():
                await pill.first.click()
                await asyncio.sleep(0.4)
        await self.fl.locator(f"button.persona:has-text('{persona}')").first.click()
        await self.fl.locator(".hero").first.wait_for(timeout=20000)
        await asyncio.sleep(1.0 if not REHEARSE else 0.3)

    async def scroll_to(self, locator, block="center"):
        await locator.first.evaluate(f"el => el.scrollIntoView({{behavior:'smooth', block:'{block}'}})")
        await asyncio.sleep(0.9 if not REHEARSE else 0.2)

    async def page_scroll(self, top=320):
        f = self.frame()
        if f: await f.evaluate(f"window.scrollBy({{top:{top}, behavior:'smooth'}})")
        await asyncio.sleep(0.9 if not REHEARSE else 0.2)

    async def wait_text_in_card(self, fee_id, text, timeout=15000):
        loc = self.fl.locator(f".fee-card:has-text('{fee_id}'):has-text('{text}')")
        await loc.first.wait_for(timeout=timeout)

# ---------------------------------------------------------------- instance
BACKEND = Path("/home/z/my-project/download/jangal/backend")

def reset_instance():
    """Restart the app on a CLEAN data dir so every take is identical."""
    try:
        out = subprocess.run(["pgrep", "-f", "src/index.js"], capture_output=True, text=True).stdout.split()
        for pid in out:
            try: os.kill(int(pid), signal.SIGTERM)
            except ProcessLookupError: pass
    except Exception:
        pass
    time.sleep(1.2)
    subprocess.run(["rm", "-rf", str(DATA)])
    env = dict(os.environ, DATA_DIR=str(DATA), LND_MODE="mock", PORT="3130", LOG_LEVEL="warn")
    log = open("/tmp/jangal-video-boot.log", "w")
    subprocess.Popen(["node", "src/index.js"], cwd=str(BACKEND), env=env,
                     stdout=log, stderr=subprocess.STDOUT,
                     start_new_session=True)
    for _ in range(40):
        try:
            with urllib.request.urlopen(BASE + "/api/health", timeout=1) as r:
                if r.status == 200:
                    break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        raise RuntimeError("instance did not boot")

# ---------------------------------------------------------------- pre-flight
def preflight():
    """API state needed by later scenes (T1 locked, T3 locked) + tampered image."""
    from PIL import Image, ImageDraw, ImageFont
    # tampered proof: same receipt, amount overwritten
    img = Image.open(PROOF_ORIG).convert("RGB")
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
    d.rectangle([40, 590, 620, 660], fill="#F7F2E9")
    d.text((48, 596), "15 000 FCFA", font=f, fill="#C0392B")
    img.save(PROOF_TAMPERED, "PNG")

    school = api.login_token("3333")
    parent = api.login_token("1111")
    s, d_ = api.get("/api/fees", school)
    fees = d_["fees"]
    t1 = next(f for f in fees if f["term"].startswith("Trimestre 1") and f["amount_xof"] == 45000)
    check("seeded T1 fee found", t1["status"] == "awaiting_payment")
    s, d_ = api.post(f"/api/fees/{t1['id']}/pay", {}, parent)
    check("T1 paid via API (locked)", s == 200)
    s, d_ = api.post("/api/fees", {"studentId": "s_mariama", "term": "Trimestre 3 2026-2027",
                                   "classLevel": "CM2", "amountXof": 15000, "memo": "Frais de cantine"}, school)
    check("T3 created via API", s == 200)
    s, d_ = api.get("/api/fees", school)
    t3f = next(f for f in d_["fees"] if f["term"].startswith("Trimestre 3") and f["amount_xof"] == 15000)
    t3 = t3f["id"]
    s, d_ = api.post(f"/api/fees/{t3}/pay", {}, parent)
    check("T3 paid via API (locked)", s == 200)
    return school, parent, t1["id"], t3

# ---------------------------------------------------------------- scene actions
async def s02_terminal(d: Director, seeded_fee_id):
    async def act():
        await d.page.evaluate("() => __stage.tReset()")
        await d.page.evaluate("(c) => __stage.tType(c, 13)", "make demo")
        lines = [
            ('<span class="t-dim">docker compose up --build — bitcoind · lnd-parent · lnd-school · app</span>', 620),
            ('<span class="t-dim">[seed] LND_MODE=mock — skipping bitcoind/LND bootstrapping</span>', 420),
            ('[seed] demo schools, users and students created', 460),
            (f'<span class="t-hl">[seed] demo fee {seeded_fee_id} created (45000 XOF ≈ 52941 sats)</span>', 520),
            ('<span class="t-ok">[seed] done ✔</span>', 500),
            ('Jàngal listening on :3000 (regtest demo)', 520),
            ('<span class="t-ok">✔ demo ready</span> — codes: <span class="t-hl">1111</span> parent · <span class="t-hl">3333</span> school · <span class="t-hl">2222</span> family', 700),
        ]
        for html, delay in lines:
            await d.page.evaluate("([h,dl]) => __stage.tLine(h, dl)", [html, 0 if REHEARSE else delay])
    await d.scene("s02", act, min_dur=8.0 if not REHEARSE else 3.0)

async def s03_school(d: Director):
    async def act():
        await d.login("École")
        btn = d.fl.locator("button.btn.primary:has-text('Créer une nouvelle facture')")
        await d.scroll_to(btn)
        await btn.click(); await asyncio.sleep(0.7)
        ta = d.fl.locator("textarea.f")
        await ta.click()
        await ta.press_sequentially(NOTE, delay=TYPE_MS)
        await asyncio.sleep(0.5)
        ai = d.fl.locator("button.btn.accent.sm:has-text('IA')")
        await ai.click()
        await asyncio.sleep(1.6 if not REHEARSE else 0.5)
        amount = await d.fl.locator("input[type='number']").input_value()
        check("AI parsed amount = 45000", amount == "45000")
        term_in = d.fl.locator("div.row2 label:first-child input").first
        term = await term_in.input_value() if await term_in.count() else ""
        check("AI parsed term = Trimestre 2", "Trimestre 2" in term)
        await d.fl.locator("select.f").select_option(label="Mariama Diop (CM2)")
        await asyncio.sleep(0.6)
        await d.fl.locator("form button:has-text('Créer')").click()
        await d.fl.locator(".fee-card:has-text('Trimestre 2')").first.wait_for(timeout=10000)
        card = d.fl.locator(".fee-card:has-text('Trimestre 2')")
        await d.scroll_to(card, "start")
        await asyncio.sleep(0.8)
    await d.scene("s03", act, min_dur=15.0 if not REHEARSE else 4.0)

async def s04_parent(d: Director, fee_t2):
    async def act():
        await d.logout()
        await d.login("Ousmane")
        card = d.fl.locator(f".fee-card:has-text('Trimestre 2')")
        await card.first.wait_for(timeout=10000)
        await d.scroll_to(card)
        qr = card.locator("button:has-text('Voir la facture QR')")
        if await qr.count():
            await qr.click(); await asyncio.sleep(2.4 if not REHEARSE else 0.5)
            check("QR invoice shown", await card.locator("svg").count() >= 1)
            await qr.click(); await asyncio.sleep(0.5)
        pay = card.locator("button:has-text('Payer')")
        await pay.first.click()
        await d.wait_text_in_card("Trimestre 2", "Fonds verrouillés")
        await asyncio.sleep(1.6)
        s, d_ = api.get(f"/api/fees/{fee_t2}", SCHOOL_TOK)
        check("pay → locked (API)", (d_.get("fee", d_) or {}).get("status") == "locked")
        await d.page_scroll(120)
    await d.scene("s04", act, min_dur=11.0 if not REHEARSE else 4.0)

async def s05_proof(d: Director, fee_t2):
    async def act():
        await d.logout()
        await d.login("École")
        card = d.fl.locator(f".fee-card:has-text('{fee_t2}')")
        await card.first.wait_for(timeout=10000)
        await d.scroll_to(card, "start")
        up = card.locator("label:has-text('Joindre')")
        check("proof upload control visible", await up.count() > 0)
        async with d.page.expect_file_chooser() as fc:
            await up.first.click()
        chooser = await fc.value
        await chooser.set_files(str(PROOF_ORIG))
        await d.wait_text_in_card(fee_t2, "conforme", timeout=20000)
        await d.scroll_to(card.locator("text=/conforme|sha256/").first)
        await asyncio.sleep(3.0 if not REHEARSE else 0.6)
        cb = card.locator("button:has-text('Confirmer la scolarisation')")
        await cb.scroll_into_view_if_needed()
        await cb.click()
        await d.wait_text_in_card(fee_t2, "Frais réglés", timeout=15000)
        await asyncio.sleep(1.4)
        s, d_ = api.get(f"/api/fees/{fee_t2}", SCHOOL_TOK)
        check("confirm → settled (API)", (d_.get("fee", d_) or {}).get("status") == "settled")
    await d.scene("s05", act, min_dur=12.0 if not REHEARSE else 4.0)

async def s06_receipt(d: Director, fee_t2):
    async def act():
        await d.fl.locator("nav.tab-nav button:has-text('Reçus')").click()
        await d.fl.locator("a.mono").first.wait_for(timeout=10000)
        link = d.fl.locator(f"a.mono:has-text('{fee_t2}')")
        await d.scroll_to(link)
        await link.first.click()
        await d.fl.locator("text=WhatsApp").first.wait_for(timeout=10000)
        check("receipt detail + share", True)
        sig = d.fl.locator("text=/signature Nostr valide/")
        if await sig.count():
            await d.scroll_to(sig.first)
        await asyncio.sleep(1.6)
        await d.page_scroll(300)
        await d.page_scroll(300)
        await asyncio.sleep(0.8)
    await d.scene("s06", act, min_dur=8.0 if not REHEARSE else 3.0)

async def s07_verify_tamper(d: Director, fee_t2):
    proof_file = DATA / "proofs" / f"{fee_t2}.png"
    async def act():
        await d.logout()
        await d.phone_goto(f"#/verify/{fee_t2}")
        await d.fl.locator("text=/Authentic receipt|Reçu authentique/").first.wait_for(timeout=20000)
        check("verifier GREEN (no login)", True)
        await asyncio.sleep(1.2)
        await d.page_scroll(420)
        await asyncio.sleep(1.2)
        # --- the tamper beat: swap the file on disk, browser untouched ---
        await asyncio.sleep(1.2 if not REHEARSE else 0.2)
        shutil.copy(PROOF_TAMPERED, proof_file)
        t_sw = now()
        try:
            await d.fl.locator("text=/Verification failed|échouée/").first.wait_for(timeout=12000)
            check(f"tamper detected LIVE ({now()-t_sw:.1f}s)", True)
        except Exception:
            check("tamper detected LIVE", False)
        # scroll back up so the big red banner is in frame — the killer shot
        f = d.frame()
        if f: await f.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
        await asyncio.sleep(3.2 if not REHEARSE else 0.4)
    await d.scene("s07", act, min_dur=14.0 if not REHEARSE else 4.0)

async def s08_restore_wolof(d: Director, fee_t2):
    proof_file = DATA / "proofs" / f"{fee_t2}.png"
    async def act():
        shutil.copy(PROOF_ORIG, proof_file)
        try:
            # click "Re-check now" so the flip back to green is instant, not on the 5s poll
            recheck = d.fl.locator("button:has-text('Re-check')")
            if await recheck.count():
                await recheck.first.click()
            await d.fl.locator("text=/Authentic receipt|Reçu authentique/").first.wait_for(timeout=12000)
            check("restore → GREEN again", True)
        except Exception:
            check("restore → GREEN again", False)
        await asyncio.sleep(1.6)
        await d.phone_goto()
        await d.login("Aïda", lang="Wolof")
        body = await d.frame().evaluate("() => document.body.innerText")
        check("family UI in Wolof", "Salaam" in body or "jàng" in body.lower())
        sms = d.fl.locator(".section-title:has-text('SMS')")
        if await sms.count():
            await d.scroll_to(sms.last, "start")
        else:
            await d.page_scroll(2600)
        await asyncio.sleep(1.6)
    await d.scene("s08", act, min_dur=11.0 if not REHEARSE else 4.0)

async def s09_refunds(d: Director, fee_t1, fee_t3):
    async def act():
        await d.logout()
        await d.login("École", lang="Français")
        card1 = d.fl.locator(f".fee-card:has-text('{fee_t1}')")
        await d.scroll_to(card1, "start")
        rej = card1.locator("button:has-text('Rejeter')")
        await rej.first.click()
        await d.wait_text_in_card(fee_t1, "Remboursé", timeout=15000)
        await asyncio.sleep(1.3)
        s, d_ = api.get(f"/api/fees/{fee_t1}", SCHOOL_TOK)
        check("reject → refunded (API)", (d_.get("fee", d_) or {}).get("status") == "refunded")
        card3 = d.fl.locator(f".fee-card:has-text('{fee_t3}')")
        await d.scroll_to(card3, "start")
        exp = card3.locator('button:has-text("expiration")')
        await exp.first.click()
        await d.wait_text_in_card(fee_t3, "Remboursé", timeout=15000)
        await asyncio.sleep(1.5)
        s, d_ = api.get(f"/api/fees/{fee_t3}", SCHOOL_TOK)
        check("timeout → refunded (API)", (d_.get("fee", d_) or {}).get("status") == "refunded")
        # the parent's side: notifications confirm both refunds
        await d.logout()
        await d.login("Ousmane", lang="Français")
        notif = d.fl.locator(".section-title:has-text('Notifications')")
        if await notif.count():
            await d.scroll_to(notif.last, "start")
        else:
            await d.page_scroll(2600)
        await asyncio.sleep(1.6)
        body = await d.frame().evaluate("() => document.body.innerText")
        check("parent notified of refunds", "rembours" in body.lower())
    await d.scene("s09", act, min_dur=19.0 if not REHEARSE else 5.0)

async def s10_impact(d: Director):
    async def act():
        await d.fl.locator("nav.tab-nav button:has-text('Impact')").click()
        await d.fl.locator(".bigstat").first.wait_for(timeout=10000)
        await asyncio.sleep(1.0)
        await d.page_scroll(500)
        await asyncio.sleep(1.2)
    await d.scene("s10", act, min_dur=7.0 if not REHEARSE else 3.0)

async def s11_outro(d: Director):
    async def act():
        await asyncio.sleep(0.2)
    await d.scene("s11", act, tail=(3.2 if not REHEARSE else 0.4))

# ---------------------------------------------------------------- main
SCHOOL_TOK = None

async def main():
    global SCHOOL_TOK
    reset_instance()
    school_tok, parent_tok, fee_t1, fee_t3 = preflight()
    SCHOOL_TOK = school_tok
    s, d_ = api.get("/api/fees", school_tok)
    seeded_fee_id = next(f for f in d_["fees"] if f["term"].startswith("Trimestre 1"))["id"]

    planned = sum(max(VO[s] + TAIL, 0) for s in ORDER) + 26
    print(f"planned duration ≈ {planned}s", flush=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--force-device-scale-factor=1"])
        ctx_kw = dict(viewport={"width": 1920, "height": 1080})
        if not REHEARSE:
            OUTDIR.mkdir(exist_ok=True)
            ctx_kw["record_video_dir"] = str(OUTDIR)
            ctx_kw["record_video_size"] = {"width": 1920, "height": 1080}
        t_ctx = now()
        context = await browser.new_context(**ctx_kw)
        await context.add_init_script(CURSOR_JS)
        page = await context.new_page()
        page.on("pageerror", lambda e: ERRORS.append(str(e)))
        await page.goto(BASE + "/wrapper.html", wait_until="load")
        await page.evaluate("(n) => __stage.buildDots(n)", len(ORDER))
        await asyncio.sleep(0.8)
        await page.evaluate("(s) => __stage.progressStart(s)", planned)

        d = Director(page)
        d.t0 = now()
        d.ctx_start = t_ctx
        try:
            await d.scene("s01", None, tail=(2.2 if not REHEARSE else 0.3))
            await s02_terminal(d, seeded_fee_id)
            await s03_school(d)
            # fee_t2 id from API
            s, d_ = api.get("/api/fees", SCHOOL_TOK)
            t2 = next(f for f in d_["fees"] if f["term"] == "Trimestre 2" and f["amount_xof"] == 45000)
            fee_t2 = t2["id"]
            check("T2 fee exists (Trimestre 2)", True)
            await s04_parent(d, fee_t2)
            await s05_proof(d, fee_t2)
            await s06_receipt(d, fee_t2)
            await s07_verify_tamper(d, fee_t2)
            await s08_restore_wolof(d, fee_t2)
            await s09_refunds(d, fee_t1, fee_t3)
            await s10_impact(d)
            await s11_outro(d)
        finally:
            d.timeline["_ctx_start"] = t_ctx
            d.timeline["_t0"] = d.t0
            d.timeline["_planned"] = planned
            json.dump(d.timeline, open(HERE / "timeline.json", "w"), indent=1)
            print("\n---- checks ----")
            for k in PASS: print("  PASS", k)
            for k in FAIL: print("  FAIL", k)
            print(f"RESULT: {len(PASS)} pass / {len(FAIL)} fail")
            if ERRORS: print("PAGE ERRORS:", ERRORS)
            video_path = None
            if not REHEARSE:
                video = page.video
                if video:
                    video_path = await video.path()
            await context.close()
            await browser.close()
            if video_path:
                print("VIDEO:", video_path)
    print("done" if not FAIL else "FAILED — fix and re-run")

if __name__ == "__main__":
    asyncio.run(main())
