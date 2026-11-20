// Family (Dakar) — read-only view of the children's fees + SMS-style notifications
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";
import { StatusBadge } from "../components/common.jsx";

export default function Family({ lang }) {
  const [fees, setFees] = useState(null);
  const [sms, setSms] = useState([]);
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    const refresh = async () => {
      const [f, s, n] = await Promise.all([api.fees(), api.sms(), api.notifications()]);
      if (f.status === 200) setFees(f.json.fees);
      if (s.status === 200) setSms(s.json.messages ?? []);
      if (n.status === 200) setNotifs(n.json.notifications ?? []);
    };
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, []);

  if (!fees) return <div className="skeleton" />;
  const L = t[lang];

  return (
    <>
      <div className="hero">
        <h1>Salaam, Aïda 👋</h1>
        <p>{L.roleFamily} · {L.refundHint}</p>
      </div>

      <div className="section-title">{L.fees}</div>
      <div className="grid">
        {fees.map((f) => (
          <div className="card fee-card" key={f.id}>
            <div className="top">
              <div>
                <div className="who">{f.student_name}</div>
                <div className="sub">{f.term} · {f.class_level} · {f.school_name}</div>
              </div>
              <div className="amount">
                <div className="xof">{f.amount_xof_fmt}</div>
              </div>
            </div>
            <StatusBadge status={f.status} lang={lang} />
            {f.status === "settled" && (
              <a href={`#/receipts/${f.id}`} style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--green-700)" }}>
                {L.receiptFor} →
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="section-title">{L.notifications}</div>
      <div className="card" style={{ padding: "6px 16px" }}>
        {notifs.length === 0 && <p style={{ color: "var(--ink-soft)" }}>—</p>}
        {notifs.slice(0, 8).map((n) => (
          <div className="notif" key={n.id}>
            <span>{n.kind === "settled" ? "✅" : n.kind === "locked" ? "🔒" : n.kind === "refunded" ? "↩️" : "🧾"}</span>
            <span>{n.message}</span>
          </div>
        ))}
      </div>

      <div className="section-title">{L.smsGateway}</div>
      <div className="card" style={{ padding: "6px 16px" }}>
        {sms.length === 0 && <p style={{ color: "var(--ink-soft)" }}>—</p>}
        {sms.slice(0, 8).map((m) => (
          <div className="notif" key={m.id}>
            <span>📱</span>
            <span>
              {m.message}
              <br />
              <span className="time" style={{ fontSize: "0.7rem", color: "var(--ink-soft)" }}>+221 77 000 00 00 · {m.lang}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
