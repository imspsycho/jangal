// AI assistant — floating chat in wolof/fr/en (mock or LLM backend)
import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

export default function Assistant({ lang }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setMsgs([
      {
        role: "bot",
        content:
          lang === "wo"
            ? "Salaam! Man maa ngi tànd Jàngal. Laaj ma fees, xaalis, walla Lightning."
            : lang === "en"
            ? "Hello! I'm the Jàngal assistant. Ask me about fees, payments or Lightning."
            : "Bonjour ! Je suis l'assistant Jàngal. Posez-moi vos questions sur les frais, paiements ou Lightning.",
      },
    ]);
  }, [lang]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = async (e) => {
    e?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const r = await api.aiAsk(question, lang, msgs.slice(-4).map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content })));
      setMsgs((m) => [...m, { role: "bot", content: r.json?.answer ?? "…" }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", content: "⚠️ network" }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label={t[lang].assistant}>
          <header>
            <span>⚡</span> {t[lang].assistant}
            <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)} aria-label="close">✕</button>
          </header>
          <div className="msgs">
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>{m.content}</div>
            ))}
            {busy && <div className="msg bot">…</div>}
            <div ref={endRef} />
          </div>
          <form className="askrow" onSubmit={send}>
            <input
              className="f"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t[lang].ask + "…"}
              aria-label={t[lang].ask}
            />
            <button className="btn primary" disabled={busy || !input.trim()}>➤</button>
          </form>
        </div>
      )}
      <button className="assistant-fab" onClick={() => setOpen((o) => !o)} aria-label={t[lang].assistant}>
        {open ? "✕" : "💬"}
      </button>
    </>
  );
}
