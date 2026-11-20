// Jàngal — API client (same-origin fetch, cookie auth)
async function req(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

export const api = {
  me: () => req("GET", "/me"),
  login: (code) => req("POST", "/auth/login", { code }),
  logout: () => req("POST", "/auth/logout"),
  meta: () => req("GET", "/meta"),
  impact: () => req("GET", "/impact"),
  family: () => req("GET", "/family/students"),
  fees: () => req("GET", "/fees"),
  fee: (id) => req("GET", `/fees/${id}`),
  createFee: (payload) => req("POST", "/fees", payload),
  pay: (id) => req("POST", `/fees/${id}/pay`, {}),
  confirm: (id) => req("POST", `/fees/${id}/confirm`, {}),
  reject: (id) => req("POST", `/fees/${id}/reject`, {}),
  wallet: () => req("GET", "/wallet"),
  notifications: () => req("GET", "/notifications"),
  sms: () => req("GET", "/sms"),
  receipts: () => req("GET", "/receipts"),
  receipt: (feeId) => req("GET", `/receipts/${feeId}`),
  aiParse: (text, locale) => req("POST", "/ai/parse-note", { text, locale }),
  aiAsk: (question, locale, history) => req("POST", "/ai/ask", { question, locale, history }),
  mine: (blocks) => req("POST", "/dev/mine", { blocks }),
};
