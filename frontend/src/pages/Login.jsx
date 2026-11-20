// Login — one-tap demo personas (each maps to a demo code)
import React from "react";
import { api } from "../api.js";
import { t, LANG_NAMES } from "../i18n.js";
import { Logo } from "../components/common.jsx";

const PERSONAS = [
  { code: "1111", name: "Ousmane Diop", sub: { wo: "Baay-baay — Paris, France", fr: "Parent diaspora — Paris, France", en: "Diaspora parent — Paris, France" }, color: "#0B6E4F", initials: "OD" },
  { code: "3333", name: "École Mame Diarra Mbaye", sub: { wo: "Ekool — Médina, Dakar", fr: "École — Médina, Dakar", en: "School — Médina, Dakar" }, color: "#E86A33", initials: "EM" },
  { code: "2222", name: "Aïda Diop", sub: { wo: "Kër gi — Dakar", fr: "Famille — Dakar", en: "Family — Dakar" }, color: "#9C6B1A", initials: "AD" },
];

export default function Login({ lang, setLang, onLogin }) {
  const [err, setErr] = React.useState("");

  const doLogin = async (code) => {
    setErr("");
    const r = await api.login(code);
    if (r.status === 200) onLogin(r.json.user);
    else setErr("✖ " + (r.json?.error ?? "login failed"));
  };

  return (
    <div className="login-wrap">
      <div className="login-logo">
        <Logo size={74} />
        <div>
          <h1 style={{ margin: 0, fontSize: "2rem" }}>{t[lang].appName}</h1>
          <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", fontSize: "0.95rem" }}>{t[lang].tagline}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {PERSONAS.map((p) => (
          <button key={p.code} className="persona" onClick={() => doLogin(p.code)}>
            <span className="avatar" style={{ background: p.color }}>{p.initials}</span>
            <span>
              <span className="p-name">{p.name}</span>
              <br />
              <span className="p-sub">{p.sub[lang]}</span>
            </span>
            <span className="p-code">{p.code}</span>
          </button>
        ))}
        {err && <p style={{ color: "var(--red-600)", fontWeight: 700, margin: "6px 2px" }}>{err}</p>}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        {Object.entries(LANG_NAMES).map(([k, label]) => (
          <button key={k} className={`btn sm ${lang === k ? "primary" : "ghost"}`} onClick={() => setLang(k)}>
            {label}
          </button>
        ))}
      </div>

      <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: "0.8rem", marginTop: 18 }}>
        Regtest demo · Bitcoin Lightning · Dakar Bitcoin Hack by BTrust 2026
      </p>
    </div>
  );
}
