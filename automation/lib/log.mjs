// 구조화 로그. 비밀번호·토큰은 절대 찍지 않는다.
const REDACT = /("?(password|pw|token|authorization)"?\s*[:=]\s*)("[^"]*"|\S+)/gi;
export function redact(s) { return String(s).replace(REDACT, "$1<redacted>"); }
export const log = {
  json: false,
  info: (m) => { if (!log.json) console.error(`[amaranth] ${redact(m)}`); },
  warn: (m) => console.error(`[amaranth] ⚠️ ${redact(m)}`),
  error: (m) => console.error(`[amaranth] ❌ ${redact(m)}`),
  result: (obj) => console.log(log.json ? JSON.stringify(obj) : Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")),
};
