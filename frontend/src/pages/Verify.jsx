// Verify — PUBLIC receipt verifier (no login).
// Anyone with the link independently checks the whole trust chain:
// Nostr signature → school key → payment hash → settled fee → AI evidence
// hash anchored → photo unchanged (sha256 re-computed server-side).
import React, { useEffect, useState } from "react";
import { t, LANGS } from "../i18n.js";
import { publicApi } from "../api.js";
import { Logo, Toast } from "../components/common.jsx";

const CHECK_LABELS = {
  nostr_signature: "verifyCheckSig",
  school_key: "verifyCheckKey",
  payment_hash: "verifyCheckHash",
  fee_settled: "verifyCheckSettled",
  evidence_anchored: "verifyCheckAnchored",
  evidence_intact: "verifyCheckIntact",
};

export default function Verify({ feeId }) {
  const [lang, setLang] = useState(
    ["wo", "fr", "en"].includes(localStorage.getItem("jangal_lang")) ? localStorage.getItem("jangal_lang") : "en"
  );
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | notfound
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  const L = t[lang];

  useEffect(() => {
    if (!feeId) return;
    setData(null);
    setState("loading");
    publicApi
      .verifyReceipt(feeId)
      .then((r) => {
        if (r.status !== 200) throw new Error("not found");
        setData(r.json);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [feeId]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const shareUrl = feeId ? `${window.location.origin}/#/verify/${feeId}` : "";

  return (
    <div className="verify-wrap">
      <header className="verify-header">
        <Logo size={44} />
        <div>
          <div className="name">Jàngal</div>
          <div className="who">{L.verifyTitle}</div>
        </div>
        <div className="spacer" />
        <div className="lang-switch" role="group" aria-label={L.lang}>
          {LANGS.map((l) => (
            <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="page">
        <div className="hero">
          <h1>{L.verifyTitle}</h1>
          <p>{L.verifySubtitle}</p>
        </div>

        {/* search box — verify any receipt id */}
        <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="f"
            style={{ flex: "1 1 220px", margin: 0 }}
            placeholder={L.verifyEnterId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input.trim() && (window.location.hash = `/verify/${input.trim()}`)}
          />
          <button
            className="btn primary"
            disabled={!input.trim()}
            onClick={() => (window.location.hash = `/verify/${input.trim()}`)}
          >
            {L.verify}
          </button>
        </div>

        {state === "loading" && <div className="skeleton" />}
        {state === "notfound" && (
          <div className="card" style={{ borderColor: "var(--red-600)" }}>
            <p style={{ fontWeight: 800, color: "var(--red-600)" }}>✖ {feeId}</p>
            <p style={{ color: "var(--ink-soft)" }}>{L.receiptInvalid} — {L.verifyEnterId}</p>
          </div>
        )}

        {state === "ok" && data && (
          <>
            {/* verdict banner */}
            <div
              className="card"
              style={{
                borderColor: data.allChecksPassed ? "var(--green-700)" : "var(--red-600)",
                background: data.allChecksPassed ? "rgba(11,110,79,0.06)" : "rgba(220,38,38,0.06)",
              }}
            >
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: data.allChecksPassed ? "var(--green-700)" : "var(--red-600)" }}>
                {data.allChecksPassed ? "✅ " + L.verifyAuthentic : "❌ " + L.verifyTampered}
              </div>
              <div className="mono" style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginTop: 6 }}>
                {data.feeId} · event {data.receipt.eventId.slice(0, 24)}…
              </div>
            </div>

            {/* receipt facts (public-safe: masked student) */}
            <div className="card">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.95rem" }}>
                <div>🎓 {data.receipt.studentMasked}</div>
                <div>🏫 {data.receipt.school}</div>
                <div>📗 {data.receipt.classLevel}</div>
                <div>🗓 {data.receipt.term}</div>
                <div>💰 {Number(data.receipt.amountXof).toLocaleString("fr-FR")} F</div>
                <div>⚡ {Number(data.receipt.amountSat).toLocaleString("fr-FR")} sats</div>
              </div>
              <div className="mono" style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginTop: 10, wordBreak: "break-all" }}>
                npub {data.receipt.npub}
                <br />
                payment_hash {data.receipt.paymentHash}
                <br />
                settled {data.receipt.settledAt}
              </div>
            </div>

            {/* the trust chain, check by check */}
            <div className="card">
              {data.checks.map((c) => (
                <div key={c.key} className="verify-check">
                  <span style={{ color: c.pass ? "var(--green-700)" : "var(--red-600)", fontWeight: 800 }}>
                    {c.pass ? "✔" : "✘"}
                  </span>
                  <span style={{ fontWeight: c.pass ? 600 : 800 }}>
                    {L[CHECK_LABELS[c.key]] ?? c.label}
                  </span>
                  <span className="mono" style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginLeft: "auto", textAlign: "right" }}>
                    {c.detail}
                  </span>
                </div>
              ))}
              {data.evidence && (
                <div style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                  🤖 {data.evidence.verdict} · {Math.round((data.evidence.confidence ?? 0) * 100)}% · {data.evidence.model}
                </div>
              )}
            </div>

            {/* share */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <a
                className="btn accent"
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Jàngal — ${L.receiptValid}\n${data.receipt.school} · ${data.receipt.studentMasked} · ${Number(data.receipt.amountXof).toLocaleString("fr-FR")} F\n${shareUrl}`
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                💬 {L.verifyShare}
              </a>
              <button
                className="btn ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                  flash(L.copied);
                }}
              >
                🔗 {L.verifyCopyLink}
              </button>
            </div>
          </>
        )}
      </main>
      <Toast msg={toast} />
      <footer className="app-footer">
        Jàngal · public receipt verifier · Nostr + Lightning + AI evidence
      </footer>
    </div>
  );
}
