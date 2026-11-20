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
          {r.content.proofSha256 && (
            <div style={{ marginTop: 8, fontSize: "0.8rem", padding: "6px 10px", borderRadius: 8, background: "var(--cream)", display: "flex", gap: 8, alignItems: "center" }}>
              <span>{r.content.proofVerdict === "match" ? "🤖✅" : r.content.proofVerdict === "mismatch" ? "🤖⚠️" : "🤖ℹ️"}</span>
              <span>
                {t[lang].proofOnReceipt} — <span className="mono">{r.content.proofSha256.slice(0, 16)}…</span>
              </span>
            </div>
          )}
          <p className="mono" style={{ margin: "10px 0 0" }}>event {r.eventId.slice(0, 32)}…</p>
        </div>
      ))}
    </>
  );
}

export function ReceiptDetail({ lang, feeId }) {
  const [r, setR] = useState(null);
  const [proof, setProof] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.receipt(feeId).then((res) => (res.status === 200 ? setR(res.json) : setNotFound(true)));
    api.proof(feeId).then((res) => res.status === 200 && setProof(res.json));
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
      {proof && (
        <div className="card">
          <h3>🤖 {L.proofOnReceipt}</h3>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <img
              src={`/api/fees/${feeId}/proof/image`}
              alt="proof"
              style={{ width: 160, borderRadius: 8, border: "1px solid var(--line)" }}
            />
            <div style={{ fontSize: "0.88rem" }}>
              <div style={{ fontWeight: 800, color: proof.verdict === "match" ? "var(--green-700)" : proof.verdict === "mismatch" ? "var(--red-600)" : "var(--ink-soft)" }}>
                {proof.verdict === "match" ? "✅ " + L.proofMatch : proof.verdict === "mismatch" ? "⚠️ " + L.proofMismatch : "ℹ️ " + L.proofUnclear}
                <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}> ({Math.round(proof.confidence * 100)}%)</span>
              </div>
              <div className="mono" style={{ fontSize: "0.74rem", color: "var(--ink-soft)", marginTop: 6 }}>
                sha256 {proof.imageSha256.slice(0, 32)}… · {proof.model}
              </div>
              <div style={{ marginTop: 8 }}>
                {(proof.checks ?? []).map((c, i) => (
                  <div key={i} style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                    {c.pass ? "✔" : "✘"} {c.name}{c.note ? ` — ${c.note}` : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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
