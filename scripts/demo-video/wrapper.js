/* Jàngal demo studio — stage controller (driven by the Playwright director) */
(function () {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- progress bar (rAF against a total duration) ----
  let progressT0 = null, progressTotal = 180;
  function progressStart(totalSeconds) {
    progressTotal = Math.max(30, totalSeconds);
    progressT0 = performance.now();
    tick();
  }
  function tick() {
    if (progressT0 == null) return;
    const frac = Math.min(1, (performance.now() - progressT0) / 1000 / progressTotal);
    $("progress-fill").style.width = (frac * 100).toFixed(2) + "%";
    requestAnimationFrame(tick);
  }
  function progressSet(frac) { progressT0 = null; $("progress-fill").style.width = (frac * 100).toFixed(2) + "%"; }

  // ---- caption panel ----
  async function setCaption({ kicker, title, sub }) {
    const els = [$("kicker"), $("title"), $("sub")];
    els.forEach((e) => e.classList.add("fade"));
    await sleep(460);
    if (kicker != null) $("kicker").textContent = kicker;
    if (title != null) $("title").textContent = title;
    if (sub != null) $("sub").textContent = sub;
    els.forEach((e) => e.classList.remove("fade"));
    await sleep(120);
  }

  function buildDots(n) {
    const d = $("dots");
    d.innerHTML = "";
    for (let i = 0; i < n; i++) d.appendChild(document.createElement("span"));
  }
  function setDot(i, state) {
    const spans = $("dots").children;
    for (let k = 0; k < spans.length; k++) spans[k].className = k < i ? "done" : k === i ? "cur" : "";
  }

  function setPersona(text) { $("persona-chip").textContent = text; }

  function setMode(mode) {
    body.className = "mode-" + mode;
  }

  // ---- title card ----
  async function setCard({ kicker, title, sub }) {
    const card = $("titlecard");
    card.style.transition = "opacity 0.5s ease";
    card.style.opacity = 0;
    await sleep(520);
    if (kicker != null) card.querySelector(".tc-kicker").textContent = kicker;
    if (title != null) card.querySelector(".tc-title").textContent = title;
    if (sub != null) card.querySelector(".tc-sub").textContent = sub;
    card.style.opacity = 1;
    await sleep(120);
  }

  // ---- phone ----
  function phoneGoto(url) {
    // cache-buster before the hash → always a full reload (fresh SPA boot)
    const i = url.indexOf("#");
    const base = i === -1 ? url : url.slice(0, i);
    const hash = i === -1 ? "" : url.slice(i);
    $("phone").src = base + (base.includes("?") ? "&" : "?") + "_r=" + Date.now() + hash;
  }
  function phoneReload() { $("phone").contentWindow.location.reload(); }

  // ---- terminal ----
  const tBody = $("t-body");
  function tScroll() { tBody.scrollTop = tBody.scrollHeight; }
  async function tReset() { tBody.innerHTML = ""; }
  async function tType(cmd, cps = 14) {
    const line = document.createElement("div");
    line.innerHTML = '<span class="t-prompt">$ </span><span class="t-cmd"></span><span class="cursor"></span>';
    tBody.appendChild(line);
    tScroll();
    const target = line.querySelector(".t-cmd");
    const cur = line.querySelector(".cursor");
    for (const ch of cmd) {
      target.textContent += ch;
      tScroll();
      await sleep(1000 / cps + Math.random() * 24);
    }
    await sleep(420);
    cur.remove();
  }
  async function tLine(html, delay = 260) {
    const line = document.createElement("div");
    line.innerHTML = html;
    tBody.appendChild(line);
    tScroll();
    await sleep(delay);
  }

  // ---- public API ----
  window.__stage = {
    setMode, setCaption, setCard, buildDots, setDot, setPersona,
    phoneGoto, phoneReload,
    tReset, tType, tLine,
    progressStart, progressSet,
  };
})();
