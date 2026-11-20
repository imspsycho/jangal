// School home — fee management, AI fee-note parser, confirm/reject escrow
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";
import { StatusBadge, Toast, fmt } from "../components/common.jsx";

const SAMPLE_NOTE =
  "École Mame Diarra Mbaye — Médina\nFrais de scolarité Trimestre 1\nÉlève : Aminata Sow — classe CM2\nMontant à payer : 45 000 FCFA\nMerci de régler avant le 15 octobre.";

export default function School({ lang, me }) {
  const [fees, setFees] = useState(null);
  const [students, setStudents] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");
  const [parsing, setParsing] = useState(false);
  const [form, setForm] = useState({ studentId: "", term: "Trimestre 1 2026-2027", classLevel: "", amountXof: "", memo: "" });
  const [proofs, setProofs] = useState({}); // feeId -> {verdict, confidence, checks, imageSha256, previewUrl, model}
  const [uploading, setUploading] = useState("");

  const refresh = async () => {
    const [f, w, s] = await Promise.all([api.fees(), api.wallet(), api.schoolStats()]);
    if (f.status === 200) setFees(f.json.fees);
    if (w.status === 200) setWallet(w.json);
    if (s.status === 200) setStats(s.json);
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

  const roster = React.useMemo(() => {
    const map = new Map();
    (fees ?? []).forEach((f) => map.set(f.student_id, { id: f.student_id, name: f.student_name, class_level: f.class_level }));
    // demo roster for both schools' students (seed data)
    [
      { id: "s_mariama", name: "Mariama Diop", class_level: "CM2" },
      { id: "s_ibrahima", name: "Ibrahim Diop", class_level: "6ème" },
    ].forEach((s) => map.set(s.id, s));
    return [...map.values()];
  }, [fees]);

  const parseNote = async () => {
    setParsing(true);
    try {
      const r = await api.aiParse(note, lang);
      if (r.status === 200) {
        const d = r.json.draft ?? {};
        const student = roster.find((s) => d.studentName && s.name.toLowerCase().includes(d.studentName.toLowerCase().split(" ")[0]));
        setForm((f) => ({
          ...f,
          amountXof: d.amountXof ? String(d.amountXof) : f.amountXof,
          classLevel: d.classLevel ?? f.classLevel,
          term: d.term ?? f.term,
          studentId: student?.id ?? f.studentId,
          memo: note.split("\n")[0].slice(0, 60) || f.memo,
        }));
        flash("✅ IA");
      } else flash("⚠️ " + (r.json?.error ?? "parse error"));
    } finally {
      setParsing(false);
    }
  };

  const createFee = async (e) => {
    e.preventDefault();
    setBusy("create");
    try {
      const r = await api.createFee({
        studentId: form.studentId,
        term: form.term,
        classLevel: form.classLevel,
        amountXof: Number(form.amountXof),
        memo: form.memo || "Frais de scolarité",
      });
      if (r.status === 200) {
        flash("🧾 " + t[lang].createFee + " ✓");
        setCreating(false);
        setNote("");
        refresh();
      } else flash("⚠️ " + (r.json?.error ?? "error"));
    } finally {
      setBusy("");
    }
  };

  const confirmFee = async (id) => {
    setBusy(id);
    try {
      const r = await api.confirm(id);
      if (r.status === 200) flash("✅ " + t[lang].confirmSuccess);
      else flash("⚠️ " + (r.json?.error ?? "error"));
    } finally {
      setBusy("");
      refresh();
    }
  };

  // AI-verified evidence: attach a photo of the fee receipt / enrolment proof.
  // The image hash + AI verdict are anchored in the Nostr receipt on settle.
  const attachProof = async (feeId, file) => {
    if (!file) return;
    setUploading(feeId);
    try {
      const imageBase64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1]);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const r = await api.uploadProof(feeId, imageBase64, file.type || "image/jpeg");
      if (r.status === 200) {
        setProofs((p) => ({ ...p, [feeId]: { ...r.json, previewUrl: URL.createObjectURL(file) } }));
        flash(r.json.verdict === "match" ? "✅ " + t[lang].proofMatch : r.json.verdict === "mismatch" ? "⚠️ " + t[lang].proofMismatch : "ℹ️ " + t[lang].proofUnclear);
      } else flash("⚠️ " + (r.json?.error ?? "upload error"));
    } finally {
      setUploading("");
    }
  };

  const expireFee = async (id) => {
    setBusy(id);
    try {
      const r = await api.expire(id);
      if (r.status === 200) flash("⏱ ↩️ " + t[lang].refunded);
      else flash("⚠️ " + (r.json?.error ?? "error"));
    } finally {
      setBusy("");
      refresh();
    }
  };

  const rejectFee = async (id) => {
    setBusy(id);
    try {
      const r = await api.reject(id);
      if (r.status === 200) flash("↩️ " + t[lang].refunded);
      else flash("⚠️ " + (r.json?.error ?? "error"));
    } finally {
      setBusy("");
      refresh();
    }
  };

  const mineBlocks = async () => {
    const r = await api.mine(3);
    if (r.status === 200) flash("⛏️ +3 blocks");
    else flash("⚠️ " + (r.json?.error ?? ""));
  };

  if (!fees) return <div className="skeleton" />;
  const L = t[lang];

  return (
    <>
      <div className="hero">
        <h1>{me.schoolId === "school_mdm" ? "École Mame Diarra Mbaye" : "Cours Sainte-Marie"}</h1>
        <p>{L.roleSchool} · Médina, Dakar</p>
        <div className="grid three" style={{ marginTop: 12 }}>
          <div className="bigstat card"><div className="n">{fmt(wallet?.balanceSat)} ⚡</div><div className="l">{L.balance}</div></div>
          <div className="bigstat card"><div className="n">{fees.filter((f) => f.status === "locked").length}</div><div className="l">{L.locked}</div></div>
          <div className="bigstat card"><div className="n">{fees.filter((f) => f.status === "settled").length}</div><div className="l">{L.settledCount}</div></div>
        </div>
      </div>

      {/* secretariat KPIs — settlement speed, refund rate, AI-proof coverage */}
      {stats && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>📊 {L.statsTitle}</h3>
            <a className="btn ghost sm" style={{ marginLeft: "auto" }} href="/api/school/fees.csv" download>
              ⬇ {L.exportCsv}
            </a>
          </div>
          <div className="grid three" style={{ marginTop: 10 }}>
            <div className="bigstat card" style={{ boxShadow: "none" }}>
              <div className="n">{stats.medianLockToSettleSeconds != null ? stats.medianLockToSettleSeconds + " s" : "—"}</div>
              <div className="l">{L.medianSettle}</div>
            </div>
            <div className="bigstat card" style={{ boxShadow: "none" }}>
              <div className="n">{Math.round((stats.refundRate ?? 0) * 100)}%</div>
              <div className="l">{L.refundRate}</div>
            </div>
            <div className="bigstat card" style={{ boxShadow: "none" }}>
              <div className="n">{Math.round((stats.aiProofRate ?? 0) * 100)}%</div>
              <div className="l">{L.aiProofRate}</div>
            </div>
          </div>
          {stats.byTerm.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 6 }}>{L.byTerm}</div>
              {stats.byTerm.slice(0, 4).map((t) => (
                <div key={t.term} className="notif">
                  <span>🗓 {t.term}</span>
                  <span>{t.settledCount}×</span>
                  <span className="time">{fmt(t.xofSettled)} F</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setCreating((c) => !c)}>{creating ? "✕" : "＋"} {L.createFee}</button>
        <button className="btn ghost" onClick={mineBlocks}>⛏️ {L.mining}</button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>{L.createFee}</h3>
          <label className="f">
            <span>{L.parseNote}</span>
            <textarea
              className="f"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={SAMPLE_NOTE}
            />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn accent sm" onClick={parseNote} disabled={parsing || !note.trim()}>
              {parsing ? t[lang].aiParsing : "✨ IA"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setNote(SAMPLE_NOTE)}>
              {L.next} 📝
            </button>
          </div>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "14px 0" }} />
          <form onSubmit={createFee}>
            <label className="f">
              <span>{L.studentName}</span>
              <select className="f" required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="">—</option>
                {roster.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.class_level})</option>
                ))}
              </select>
            </label>
            <div className="row2">
              <label className="f">
                <span>{L.term}</span>
                <input className="f" required value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
              </label>
              <label className="f">
                <span>{L.classLevel}</span>
                <input className="f" required value={form.classLevel} onChange={(e) => setForm({ ...form, classLevel: e.target.value })} />
              </label>
            </div>
            <div className="row2">
              <label className="f">
                <span>{L.amount} (FCFA)</span>
                <input className="f" required type="number" min="1000" step="500" value={form.amountXof} onChange={(e) => setForm({ ...form, amountXof: e.target.value })} />
              </label>
              <label className="f">
                <span>{L.memo}</span>
                <input className="f" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </label>
            </div>
            <button className="btn primary" disabled={busy === "create"}>{busy === "create" ? "…" : "🧾 " + L.createFee}</button>
          </form>
        </div>
      )}

      <div className="section-title">{L.fees}</div>
      <div className="grid">
        {fees.length === 0 && <div className="card" style={{ color: "var(--ink-soft)" }}>—</div>}
        {fees.map((f) => (
          <div className="card fee-card" key={f.id}>
            <div className="top">
              <div>
                <div className="who">{f.student_name}</div>
                <div className="sub">{f.term} · {f.class_level} · {f.id}</div>
              </div>
              <div className="amount">
                <div className="xof">{f.amount_xof_fmt}</div>
                <div className="sat">≈ {fmt(f.amount_sat)} {L.sats}</div>
              </div>
            </div>
            <StatusBadge status={f.status} lang={lang} />
            {f.status === "locked" && (
              <>
                <div className="hint green">{L.schoolConfirmHint}</div>
                {/* AI-verified proof (recommended before confirming) */}
                {proofs[f.id] ? (
                  <div className="card" style={{ background: "var(--cream)", boxShadow: "none", padding: 12 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {proofs[f.id].previewUrl && (
                        <img src={proofs[f.id].previewUrl} alt="proof" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
                      )}
                      <div style={{ fontSize: "0.85rem" }}>
                        <div style={{ fontWeight: 800, color: proofs[f.id].verdict === "match" ? "var(--green-700)" : "var(--red-600)" }}>
                          {proofs[f.id].verdict === "match" ? "✅ " : proofs[f.id].verdict === "mismatch" ? "⚠️ " : "ℹ️ "}
                          {proofs[f.id].verdict === "match" ? L.proofMatch : proofs[f.id].verdict === "mismatch" ? L.proofMismatch : L.proofUnclear}
                          <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}> ({Math.round(proofs[f.id].confidence * 100)}%)</span>
                        </div>
                        <div className="mono" style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginTop: 4 }}>
                          sha256 {proofs[f.id].imageSha256?.slice(0, 24)}… · {proofs[f.id].model}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          {(proofs[f.id].checks ?? []).slice(0, 4).map((c, i) => (
                            <div key={i} style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>{c.pass ? "✔" : "✘"} {c.name}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="hint" style={{ margin: "8px 0 0" }}>{L.proofOnReceipt}</p>
                  </div>
                ) : (
                  <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                    {uploading === f.id ? "… " + L.aiChecking : "📷 " + L.attachProof}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      disabled={uploading === f.id}
                      onChange={(e) => attachProof(f.id, e.target.files?.[0])}
                    />
                  </label>
                )}
                <div className="fee-actions">
                  <button className="btn primary" disabled={busy === f.id} onClick={() => confirmFee(f.id)}>
                    ✅ {L.confirm}
                  </button>
                  <button className="btn danger" disabled={busy === f.id} onClick={() => rejectFee(f.id)}>
                    ↩️ {L.reject}
                  </button>
                </div>
                <button className="btn ghost sm" style={{ marginTop: 8 }} disabled={busy === f.id} onClick={() => expireFee(f.id)}>
                  ⏱ {L.simulateTimeout}
                </button>
              </>
            )}
            {f.status === "settled" && (
              <a href={`#/receipts/${f.id}`} style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--green-700)" }}>
                {L.receiptFor} →
              </a>
            )}
          </div>
        ))}
      </div>

      <Toast msg={toast} />
    </>
  );
}
