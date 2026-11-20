// Parent (diaspora) home — students, fee list, Lightning payment flow
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";
import { StatusBadge, QR, Toast, fmt } from "../components/common.jsx";

export default function Parent({ lang, me }) {
  const [data, setData] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [payingFee, setPayingFee] = useState(null); // fee being paid (modal)
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [showInvoice, setShowInvoice] = useState(null);

  const refresh = async () => {
    const [f, w, n] = await Promise.all([api.family(), api.wallet(), api.notifications()]);
    if (f.status === 200) setData(f.json);
    if (w.status === 200) setWallet(w.json);
    if (n.status === 200) setNotifs(n.json.notifications ?? []);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, []);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 3200);
  };

  const pay = async (fee) => {
    setBusy(fee.id);
    try {
      const r = await api.pay(fee.id);
      if (r.status === 200) {
        flash(t[lang].paySuccess);
        setShowInvoice(null);
        setPayingFee(null);
      } else flash("⚠️ " + (r.json?.error ?? "error"));
    } finally {
      setBusy("");
      refresh();
    }
  };

  if (!data) return <div className="skeleton" />;
  const L = t[lang];

  return (
    <>
      <div className="hero">
        <h1>{L.home}, 👋 {me.name.split(" ")[0]}</h1>
        <p>{L.tagline}</p>
        <div className="grid three" style={{ marginTop: 12 }}>
          <div className="bigstat card"><div className="n">{fmt(wallet?.balanceSat)} ⚡</div><div className="l">{L.balance} (sats)</div></div>
          <div className="bigstat card"><div className="n">{data.students.length}</div><div className="l">{L.students}</div></div>
          <div className="bigstat card"><div className="n">{data.fees.filter((f) => f.status === "locked").length}</div><div className="l">{L.locked}</div></div>
        </div>
      </div>

      <div className="section-title">{L.students}</div>
      <div className="grid two">
        {data.students.map((s) => (
          <div className="card" key={s.id}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="avatar" style={{ background: "#0B6E4F", width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>
                {s.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <div>
                <div style={{ fontWeight: 800 }}>{s.name}</div>
                <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{s.class_level} · {s.school_name}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">{L.fees}</div>
      <div className="grid">
        {data.fees.length === 0 && <div className="card" style={{ color: "var(--ink-soft)" }}>—</div>}
        {data.fees.map((f) => (
          <div className="card fee-card" key={f.id}>
            <div className="top">
              <div>
                <div className="who">{f.student_name}</div>
                <div className="sub">{f.term} · {f.class_level} · {f.school_name}</div>
              </div>
              <div className="amount">
                <div className="xof">{f.amount_xof_fmt}</div>
                <div className="sat">≈ {fmt(f.amount_sat)} {L.sats}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusBadge status={f.status} lang={lang} />
              {f.status === "settled" && (
                <a href={`#/receipts/${f.id}`} style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--green-700)" }}>
                  {L.receiptFor} →
                </a>
              )}
            </div>
            {f.status === "locked" && <div className="hint">{L.schoolConfirmHint}<br />{L.refundHint}</div>}
            {f.status === "awaiting_payment" && (
              <div className="fee-actions">
                <button className="btn accent" disabled={busy === f.id} onClick={() => pay(f)}>
                  {busy === f.id ? "…" : "⚡ " + L.pay}
                </button>
                <button className="btn ghost sm" onClick={() => setShowInvoice(showInvoice === f.id ? null : f.id)}>
                  {L.showInvoice}
                </button>
              </div>
            )}
            {showInvoice === f.id && (
              <div className="card" style={{ background: "var(--cream)", boxShadow: "none" }}>
                <QR value={f.payment_request ?? ""} size={190} />
                <p className="invoice-str">{f.payment_request}</p>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(f.payment_request ?? "");
                    flash(L.copied);
                  }}
                >
                  📋 {L.copyInvoice}
                </button>
              </div>
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
            <span className="time">{(n.created_at ?? "").slice(5, 16)}</span>
          </div>
        ))}
      </div>

      <Toast msg={toast} />
    </>
  );
}
