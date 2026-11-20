// Impact — live counters + cited context numbers
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";
import { fmt } from "../components/common.jsx";

export default function Impact({ lang }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.impact().then((r) => r.status === 200 && setD(r.json));
  }, []);
  if (!d) return <div className="skeleton" />;
  const L = t[lang];

  return (
    <>
      <div className="hero">
        <h1>{L.impactTitle}</h1>
        <p>{L.tagline}</p>
      </div>
      <div className="grid three">
        <div className="card bigstat"><div className="n">{fmt(d.fees.settled)}</div><div className="l">{L.settledCount}</div></div>
        <div className="card bigstat"><div className="n">{fmt(d.fees.satsSettled)}</div><div className="l">{L.satsForEducation}</div></div>
        <div className="card bigstat"><div className="n">{fmt(d.schools)}</div><div className="l">{L.schoolsOnboard}</div></div>
        <div className="card bigstat"><div className="n">{fmt(d.fees.locked)}</div><div className="l">{L.locked}</div></div>
        <div className="card bigstat"><div className="n">{fmt(d.fees.refunded)}</div><div className="l">{L.autoRefunded}</div></div>
        <div className="card bigstat"><div className="n">{fmt(d.fees.satsSettled * 0)}</div><div className="l">{L.autoRefunded}</div></div>
      </div>

      <div className="section-title">Contexte · Senegal</div>
      <div className="card">
        {d.citations.map((c, i) => (
          <div className="notif" key={i}>
            <span>📊</span>
            <span>{c.label}: <b>{c.value}</b></span>
          </div>
        ))}
      </div>
    </>
  );
}
