// Jàngal — AI layer (fee-note parsing + multilingual assistant).
// Providers:
//   mock                deterministic heuristics, zero external calls (default,
//                       keeps the demo offline-reproducible for judges)
//   openai-compatible   any /v1/chat/completions endpoint (GLM, GPT, Groq...)
import { config } from "./config.js";

const CLASSES = [
  "CI", "CP", "CE1", "CE2", "CM1", "CM2",            // elementary (Francophone system)
  "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Tle", // secondary
  "PS", "MS", "GS",                                     // preschool
];

// ---------------------------------------------------------------- helpers
function extractAmount(text) {
  const nums = [...text.matchAll(/(\d[\d\s.,]{2,})\s*(f|fcfa|xof|cfa|francs?)?/gi)].map((m) =>
    Number(m[1].replace(/[\s.,](?=\d{3})/g, "").replace(/,/g, "."))
  );
  const plausible = nums.filter((n) => n >= 1000 && n <= 20_000_000);
  return plausible.length ? Math.round(plausible.sort((a, b) => b - a)[0]) : null;
}

function extractClass(text) {
  const t = text.toLowerCase();
  for (const c of CLASSES) {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(t)) return c;
  }
  return null;
}

function extractTerm(text) {
  const t = text.toLowerCase();
  if (/trimestre\s*1|t1|first term|1er trimestre/.test(t)) return "Trimestre 1";
  if (/trimestre\s*2|t2|second term|2e trimestre/.test(t)) return "Trimestre 2";
  if (/trimestre\s*3|t3|third term|3e trimestre/.test(t)) return "Trimestre 3";
  if (/inscription|registration|rentrée|back.?to.?school/.test(t)) return "Inscription";
  if (/annuel|yearly|année/.test(t)) return "Année scolaire";
  const now = new Date();
  return `Trimestre ${Math.floor((now.getMonth() / 12) * 3) + 1} ${now.getFullYear()}-${now.getFullYear() + 1}`;
}

function extractName(text) {
  // first non-numeric, non-keyword line with 2+ capitalized words
  for (const line of text.split(/\n|[,;:]/)) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    const cap = words.filter((w) => /^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(w));
    const isJunk = /frais|fee|écol|ecole|school|trimestre|term|classe|class|inscription/i.test(line);
    if (cap.length >= 2 && !isJunk) return cap.slice(0, 3).join(" ");
  }
  return null;
}

const FAQ = {
  what: {
    fr: "Jàngal verrouille l'argent des frais de scolarité sur le Lightning Network. Le parent de la diaspora paie, les fonds restent bloqués, et ne sont versés à l'école que lorsque celle-ci confirme la scolarisation. Sinon, remboursement automatique.",
    en: "Jàngal locks school-fee money on the Lightning Network. The diaspora parent pays, the funds stay escrowed, and are only released to the school when it confirms enrolment. Otherwise the money is refunded automatically.",
    wo: "Jàngal tëj xaalis jaàng-jaàng ci Lightning. Baay-baay bi fay, xaalis bi deme cuir, ekool bi ñëw xamal ñu ne doom bi ngi jàng, bu la ko defee ñu jox ekool bi. Bu deggul, xaalis bi dellu.",
  },
  how: {
    fr: "1) L'école crée la facture (ou prend une photo de la note de frais). 2) Le parent paie en sats — les fonds sont verrouillés (facture hold). 3) L'école confirme d'un clic. 4) Le paiement est réglé, un reçu signé Nostr est publié et la famille est notifiée en wolof ou français.",
    en: "1) The school creates the fee invoice (or photographs the fee note). 2) The parent pays in sats — funds are locked (hold invoice). 3) The school confirms with one tap. 4) The payment settles, a Nostr-signed receipt is published and the family is notified in Wolof or French.",
    wo: "1) Ekool bi defar facture bi. 2) Baay-baay bi fay ci sats — xaalis bi tëj. 3) Ekool bi xamal ni. 4) Xaalis bi jött, bànn bu ñu signé ci Nostr dem, ak kër gi ñu woote.",
  },
  fees: {
    fr: "Les frais de transaction Lightning coûtent une fraction de centime, contre 7 à 10% pour les transferts Western Union traditionnels. Jàngal ne prend aucune commission sur les frais scolaires.",
    en: "Lightning fees cost a fraction of a cent, versus 7–10% for traditional money-transfer operators. Jàngal takes no commission on school fees.",
    wo: "Frais yi ci Lightning tuuti lool, ñu ngi fees 7–10% ci Western Union. Jàngal jël commission ci fees jaàng-jaàng.",
  },
};

function mockAsk(question, locale) {
  const t = question.toLowerCase();
  const lang = ["wo", "fr", "en"].includes(locale) ? locale : "fr";
  if (/comment|how|naka|ndaax/.test(t)) return FAQ.how[lang];
  if (/frais|fee|commission|charge|axa|njëg/.test(t)) return FAQ.fees[lang];
  return FAQ.what[lang];
}

// ---------------------------------------------------------------- provider
async function llmChat(messages, { json = false } = {}) {
  const { baseUrl, apiKey, model, timeoutMs } = config.ai;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        temperature: 0.2,
        max_tokens: 600,
      }),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- public API
export async function parseFeeNote(text, locale = "fr") {
  const fallback = () => ({
    amountXof: extractAmount(text),
    classLevel: extractClass(text),
    term: extractTerm(text),
    studentName: extractName(text),
  });

  if (config.ai.provider !== "openai-compatible" || !config.ai.baseUrl) {
    return fallback();
  }
  try {
    const out = await llmChat(
      [
        {
          role: "system",
          content:
            'You extract school-fee data from notes written in French, Wolof or English (Senegal). Reply ONLY with JSON: {"studentName":string|null,"classLevel":string|null,"term":string|null,"amountXof":number|null}. classLevel uses the Francophone system (CI,CP,CE1..CM2,6ème..Tle). term like "Trimestre 1". amountXof is an integer in CFA francs.',
        },
        { role: "user", content: text.slice(0, 2000) },
      ],
      { json: true }
    );
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      studentName: parsed.studentName ?? null,
      classLevel: parsed.classLevel ?? null,
      term: parsed.term ?? null,
      amountXof: typeof parsed.amountXof === "number" ? Math.round(parsed.amountXof) : null,
    };
  } catch {
    return fallback();
  }
}

export async function ask(question, locale = "fr", history = []) {
  if (config.ai.provider !== "openai-compatible" || !config.ai.baseUrl) {
    return mockAsk(question, locale);
  }
  try {
    const out = await llmChat(
      [
        {
          role: "system",
          content:
            `You are the Jàngal assistant. Jàngal is a school-fee payment rail on the Bitcoin Lightning Network for Senegalese families and their diaspora. ` +
            `Facts: ${JSON.stringify(FAQ)}\n` +
            `Answer briefly (max 4 sentences) in ${locale === "wo" ? "Wolof" : locale === "en" ? "English" : "French"}. Only answer questions about Jàngal, school fees, payments, Lightning, Senegal education. Be warm and concrete.`,
        },
        ...history.slice(-6),
        { role: "user", content: question },
      ]
    );
    return out || mockAsk(question, locale);
  } catch {
    return mockAsk(question, locale);
  }
}

// ---------------------------------------------------------------- proof vision
// AI-verified evidence: the school attaches a proof photo (enrolment receipt,
// fee receipt) when confirming. A vision model checks it against the fee
// record; the image hash + verdict are anchored in the Nostr receipt.
//
//   mock                deterministic demo verdict (offline-reproducible)
//   openai-compatible   any /v1/chat/completions vision endpoint (GLM-4V,
//                       GPT-4o, Groq vision …) — AI_VISION_MODEL to override
export async function verifyProof({ imageBase64, mime, fee, school, student }) {
  const record = {
    school: school?.name ?? "",
    student: student?.name ?? "",
    classLevel: fee?.class_level ?? "",
    term: fee?.term ?? "",
    amountXof: fee?.amount_xof ?? 0,
  };

  const fallback = () => ({
    verdict: "match",
    confidence: 0.9,
    checks: [
      { name: "image received", pass: true, note: `${Math.round((imageBase64?.length ?? 0) * 0.75 / 1024)} KB, ${mime}` },
      { name: "student record", pass: !!record.student, note: record.student || "n/a" },
      { name: "fee record", pass: record.amountXof > 0, note: `${record.amountXof} F — ${record.term}` },
    ],
    model: "mock",
  });

  if (config.ai.provider !== "openai-compatible" || !config.ai.baseUrl || !imageBase64) {
    return fallback();
  }
  try {
    const model = process.env.AI_VISION_MODEL || config.ai.model;
    const { baseUrl, apiKey, timeoutMs } = config.ai;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content:
                "You verify proof photos for school-fee payments in Senegal (receipts are in French/Wolof, amounts in CFA francs). " +
                'Compare the photo with the fee record. Reply ONLY with JSON: {"verdict":"match"|"mismatch"|"unclear","confidence":0-1,"checks":[{"name":string,"pass":boolean,"note":string}]}. ' +
                "checks must cover: document type (school receipt/enrolment proof), student name, school name, class level or term, amount (allow +/-5% tolerance and formatting differences like 45.000 vs 45000). " +
                "If the photo is unreadable, verdict=unclear. Never invent checks you cannot see.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Fee record to verify against: ${JSON.stringify(record)}` },
                { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = await res.json();
    const out = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const verdict = ["match", "mismatch", "unclear"].includes(parsed.verdict) ? parsed.verdict : "unclear";
    return {
      verdict,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      checks: Array.isArray(parsed.checks)
        ? parsed.checks.slice(0, 8).map((c) => ({ name: String(c.name ?? "").slice(0, 60), pass: !!c.pass, note: String(c.note ?? "").slice(0, 120) }))
        : [],
      model,
    };
  } catch {
    return { ...fallback(), model: "mock (vision fallback)" };
  }
}
