// shared components: logo, badges, QR, fee cards, toast
import React from "react";
import qrcode from "qrcode-generator";
import { t } from "../i18n.js";

export function Logo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Jàngal">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B6E4F" />
          <stop offset="1" stopColor="#073D2B" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lg)" />
      <path d="M14 38c6-3 10-3 17 0 7-3 11-3 17 0v8c-6-3-10-3-17 0-7-3-11-3-17 0z" fill="#FAF6EF" />
      <path d="M32 12c-2 4-6 6-6 10 0 3 2.5 5 6 5s6-2 6-5c0-4-4-6-6-10z" fill="#E86A33" />
      <path d="M31 27h2v9h-2z" fill="#FAF6EF" />
      <path d="M44 14l-4 6h3l-2 5 6-7h-3l2-4z" fill="#F0C34D" />
    </svg>
  );
}

export const STATUS_KEY = {
  awaiting_payment: "awaiting",
  locked: "locked",
  settled: "settled",
  refunded: "refunded",
  canceled: "canceled",
};

export function StatusBadge({ status, lang }) {
  const key = STATUS_KEY[status] ?? "awaiting";
  const live = status === "locked" || status === "awaiting_payment";
  return (
    <span className={`badge ${status}`}>
      {live && <span className="dot" />}
      {t[lang][key]}
    </span>
  );
}

export function QR({ value, size = 200 }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  let paths = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.isDark(x, y))
        paths += `M${(x * cell).toFixed(1)} ${(y * cell).toFixed(1)}h${cell.toFixed(1)}v${cell.toFixed(1)}h-${cell.toFixed(1)}z`;
  return (
    <div className="qr-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Lightning invoice QR">
        <rect width={size} height={size} fill="#fff" />
        <path d={paths} fill="#1C2B24" />
      </svg>
    </div>
  );
}

export function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

export function fmt(n) {
  return Number(n ?? 0).toLocaleString("fr-FR");
}

export function Spinner() {
  return <div className="skeleton" style={{ marginBottom: 12 }} />;
}
