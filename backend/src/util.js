// Jàngal — shared helpers: ids, XOF↔sats conversion, localized notifications
import crypto from "node:crypto";
import { config } from "./config.js";
import { q } from "./db.js";

export const shortId = (prefix) =>
  `${prefix}_${crypto.randomBytes(4).toString("hex")}`; // e.g. fee_9a3f21bc

export const xofToSat = (xof) => Math.round(xof / config.rate.xofPerSat);
export const satToXof = (sat) => Math.round(sat * config.rate.xofPerSat);
export const fmtXof = (xof) => `${Number(xof).toLocaleString("fr-FR")} F`;
export const fmtSat = (sat) => `${Number(sat).toLocaleString("fr-FR")} sats`;

const MSG = {
  fr: {
    fee_created: (f) => `Nouvelle facture : ${f.student_name} — ${fmtXof(f.amount_xof)} (${f.term}), ${f.school_name}. Payable via Jàngal.`,
    locked: (f) => `Paiement de ${fmtXof(f.amount_xof)} verrouillé pour ${f.student_name}. En attente de confirmation par ${f.school_name}.`,
    settled: (f) => `Frais de ${f.student_name} (${fmtXof(f.amount_xof)}) confirmés par ${f.school_name}. Reçu signé №${f.id}.`,
    refunded: (f) => `Paiement pour ${f.student_name} annulé — ${fmtXof(f.amount_xof)} remboursés automatiquement.`,
  },
  en: {
    fee_created: (f) => `New invoice: ${f.student_name} — ${fmtXof(f.amount_xof)} (${f.term}), ${f.school_name}. Payable via Jàngal.`,
    locked: (f) => `Payment of ${fmtXof(f.amount_xof)} locked for ${f.student_name}. Awaiting confirmation by ${f.school_name}.`,
    settled: (f) => `${f.student_name}'s fees (${fmtXof(f.amount_xof)}) confirmed by ${f.school_name}. Signed receipt №${f.id}.`,
    refunded: (f) => `Payment for ${f.student_name} cancelled — ${fmtXof(f.amountXof ?? f.amount_xof)} automatically refunded.`,
  },
  wo: {
    fee_created: (f) => `Bénéno facture : ${f.student_name} — ${fmtXof(f.amount_xof)} (${f.term}), ${f.school_name}. Fay ak Jàngal.`,
    locked: (f) => `Xaalis ${fmtXof(f.amount_xof)} tëj na ci turu ${f.student_name}. Ñu ngi xaar ${f.school_name} xamal.`,
    settled: (f) => `Fees ${f.student_name} (${fmtXof(f.amount_xof)}) ${f.school_name} xamal na. Reçu bu ñu signe №${f.id}.`,
    refunded: (f) => `Fees ${f.student_name} bees na — ${fmtXof(f.amount_xof)} dellu na.`,
  },
};

export function localized(kind, locale, fee) {
  const table = MSG[["wo", "fr", "en"].includes(locale) ? locale : "fr"];
  return table[kind](fee);
}

// Demo "SMS gateway" — writes to sms_outbox (docs/threat-model.md explains
// where a real provider like the Orange SMS API / Africa's Talking plugs in).
export function queueSms(kind, fee, locale = "fr") {
  q.insertSms.run(fee.id, localized(kind, locale, fee), locale);
}
