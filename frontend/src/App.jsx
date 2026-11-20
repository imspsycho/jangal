// Jàngal — app shell: session, header, tabs, hash routing, assistant
import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { t, LANGS, LANG_NAMES } from "./i18n.js";
import { Logo } from "./components/common.jsx";
import Assistant from "./components/Assistant.jsx";
import Login from "./pages/Login.jsx";
import Parent from "./pages/Parent.jsx";
import School from "./pages/School.jsx";
import Family from "./pages/Family.jsx";
import { Receipts, ReceiptDetail } from "./pages/Receipts.jsx";
import Impact from "./pages/Impact.jsx";

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = logged out
  const [lang, setLang] = useState(localStorage.getItem("jangal_lang") || "fr");
  const [route, setRoute] = useState(window.location.hash.replace(/^#\/?/, "") || "");

  useEffect(() => {
    api.me().then((r) => setMe(r.status === 200 ? r.json.user : null));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#\/?/, ""));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const changeLang = (l) => {
    setLang(l);
    localStorage.setItem("jangal_lang", l);
  };

  if (me === undefined) return <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>…</div>;

  if (!me)
    return (
      <>
        <Login lang={lang} setLang={changeLang} onLogin={(u) => { setMe(u); setRoute(""); }} />
        <Assistant lang={lang} />
      </>
    );

  const L = t[lang];
  const tabs =
    me.role === "parent"
      ? [["", L.home], ["fees", L.fees], ["notifications", L.notifications], ["impact", L.impact]]
      : me.role === "school"
      ? [["", L.home], ["fees", L.fees], ["receipts", L.receipts], ["impact", L.impact]]
      : [["", L.home], ["notifications", L.notifications], ["receipts", L.receipts], ["impact", L.impact]];

  const isHome = route === "";
  let page;
  if (route.startsWith("receipts/")) page = <ReceiptDetail lang={lang} feeId={route.split("/")[1]} />;
  else if (route === "receipts") page = <Receipts lang={lang} />;
  else if (route === "fees" || isHome)
    page = me.role === "parent" ? <Parent lang={lang} me={me} /> : me.role === "school" ? <School lang={lang} me={me} /> : <Family lang={lang} me={me} />;
  else if (route === "notifications")
    page = me.role === "family" ? <Family lang={lang} me={me} /> : <Parent lang={lang} me={me} />;
  else if (route === "impact") page = <Impact lang={lang} />;
  else page = <Parent lang={lang} me={me} />;

  return (
    <>
      <header className="app-header">
        <div className="row">
          <div className="brand">
            <Logo />
            <div>
              <div className="name">Jàngal</div>
              <div className="who">{me.name}</div>
            </div>
          </div>
          <div className="spacer" />
          <div className="lang-switch" role="group" aria-label={L.lang}>
            {LANGS.map((l) => (
              <button key={l} className={lang === l ? "on" : ""} onClick={() => changeLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="icon-btn"
            style={{ lineHeight: 1.1, fontSize: "0.78rem" }}
            aria-label={L.logout}
            title={L.logout}
            onClick={async () => {
              await api.logout();
              setMe(null);
              setRoute("");
            }}
          >
            ⏻
          </button>
        </div>
        <nav className="tab-nav">
          {tabs.map(([r, label]) => (
            <button
              key={r}
              className={route === r || (r === "" && isHome) ? "on" : ""}
              onClick={() => (window.location.hash = r ? `#/${r}` : "#/")}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="page">{page}</main>

      <footer className="app-footer">
        Jàngal · ⚡ Bitcoin Lightning (regtest demo) · Nostr receipts · Wolof · Français · English
        <br />
        Dakar Bitcoin Hack by BTrust 2026
      </footer>

      <Assistant lang={lang} />
    </>
  );
}
