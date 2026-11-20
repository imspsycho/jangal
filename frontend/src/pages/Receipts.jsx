// Receipts — Nostr-signed receipt explorer + signature verification
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

export function Receipts({ lang }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.receipts().then((r) => r.status === 200 && setRows(r.json.receipts));
  }, []);

  if (!rows) return <div className="skeleton" />;
  const L = t[lang];

  return (
    <>
      <div className="hero">
        <h1>{L.receipts}</h1>
        <p>Nostr · kind 30078 · {L.exploreReceipts}</p>
      </div>
      {rows.length === 0 && <div className="card" style={{ color: "var(--ink-soft)" }}>—</div>}
      {rows.map((r) => (
        <div className="receipt-item" key={r.feeId}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span className={`valid ${r.valid ? "" : "bad"}`} style={{ color: r.valid ? "var(--green-700)" : "var(--red-600)" }}>
              {r.valid ? "✔ " + L.receiptValid : "✖ " + L.receiptInvalid}
            </span>
            <a className="mono" style={{ marginLeft: "auto" }} href={`#/receipts/${r.feeId}`}>{r.feeId}</a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: "0.92rem" }}>
            <div>🎓 {r.content.student ?? "—"}</div>
            <div>🏫 {r.content.school}</div>
            <div>📗 {r.content.classLevel}</div>
            <div>🗓 {r.content.term}</div>
            <div>💰 {Number(r.content.amountXof ?? 0).toLocaleString("fr-FR")} F</div>
            <div>⚡ {Number(r.content.amountSat ?? 0).toLocaleString("fr-FR")} sats</div>
          </div>
          <p className="mono" style={{ margin: "10px 0 0" }}>event {r.eventId.slice(0, 32)}…</p>
        </div>
      ))}
    </>
  );
}

export function ReceiptDetail({ lang, feeId }) {
  const [r, setR] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.receipt(feeId).then((res) => (res.status === 200 ? setR(res.json) : setNotFound(true)));
  }, [feeId]);

  if (notFound)
    return (
      <div className="card">
        <p>ℹ️ {t[lang].receiptFor} — {feeId}</p>
        <p style={{ color: "var(--ink-soft)" }}>No settled receipt yet. Pay and confirm the fee first.</p>
      </div>
    );
  if (!r) return <div className="skeleton" />;
  const L = t[lang];

  return (
    <>
      <div className="hero">
        <h1>{L.receiptFor} {r.feeId}</h1>
        <p className="mono" style={{ color: "var(--green-700)", fontWeight: 700 }}>
          {r.valid ? "✔ " + L.receiptValid : "✖ " + L.receiptInvalid}
        </p>
      </div>
      <div className="card receipt-item">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.8rem", fontFamily: "ui-monospace, monospace" }}>
{JSON.stringify(r.content, null, 2)}
        </pre>
      </div>
      <div className="card">
        <h3>Nostr event</h3>
        <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
{JSON.stringify({ id: r.event.id, pubkey: r.event.pubkey, kind: r.event.kind, sig: r.event.sig?.slice(0, 64) + "…", tags: r.event.tags }, null, 2)}
        </pre>
      </div>
    </>
  );
}
