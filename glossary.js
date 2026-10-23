// 용어집: 번역 전에 용어를 임시 표식으로 바꿔 두었다가, 번역 후 지정한 번역어로 되돌림
// glossary.json 의 각 항목은 { "ko": "휴학", "en": "leave of absence", "ja": "休学", "zh-CN": "休学", "zh-TW": "休學" }
// 값에 배열을 쓰면 첫 번째가 번역어, 나머지는 같은 뜻의 다른 표기(원문에서 찾을 때만 사용)
// 화면에서 추가한 용어(user)는 이 컴퓨터의 브라우저에 저장되고, 같은 한국어 용어는 glossary.json 보다 우선함
const CODE = { ko: "ko", en: "en", ja: "ja", zh: "zh-CN", "zh-Hant": "zh-TW" };
const KEY = "glossary:user";
let entries = [];
let user = loadUser();

function loadUser() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(a) ? a.filter((e) => e && typeof e.en === "string" && e.ko) : [];
  } catch { return []; }
}
function saveUser() { try { localStorage.setItem(KEY, JSON.stringify(user)); } catch {} }

export const glossaryReady = fetch("glossary.json?v=1")
  .then((r) => (r.ok ? r.json() : []))
  .then((g) => { entries = Array.isArray(g) ? g : []; })
  .catch(() => {});

const asList = (v) => (Array.isArray(v) ? v : [v]).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isLatin = (s) => /^[\x00-\x7F]+$/.test(s);
const pattern = (term) => new RegExp(isLatin(term) ? `(?<![A-Za-z])${esc(term)}(?![A-Za-z])` : esc(term), "gi");

/* ---------- 화면용: 목록 / 추가 / 삭제 / 내보내기 ---------- */
const koKey = (e) => asList(e.ko)[0] || "";
export function listTerms() {
  const mine = new Set(user.map((e) => koKey(e).toLowerCase()));
  return [
    ...user.map((e, i) => ({ ko: asList(e.ko).join(", "), en: e.en, own: true, index: i })),
    ...entries.filter((e) => !mine.has(koKey(e).toLowerCase())).map((e) => ({ ko: asList(e.ko).join(", "), en: asList(e.en)[0] || "", own: false })),
  ];
}

// ko: "휴학, 휴학하다" 처럼 쉼표로 같은 뜻의 표기를 함께 쓸 수 있음. 실패하면 사유 문자열을 돌려줌
export function addTerm(koText, enText) {
  const ko = koText.split(",").map((s) => s.trim()).filter(Boolean);
  const en = enText.trim();
  if (!ko.length || !en) return "한국어와 영어를 모두 입력하세요.";
  if (ko.some((s) => s.length > 40) || en.length > 80) return "용어가 너무 깁니다.";
  const first = ko[0].toLowerCase();
  user = user.filter((e) => koKey(e).toLowerCase() !== first); // 같은 용어는 덮어씀
  user.unshift({ ko: ko.length > 1 ? ko : ko[0], en });
  saveUser();
  return "";
}
export function removeTerm(index) { user.splice(index, 1); saveUser(); }

// 내 용어를 glossary.json 에 합칠 수 있는 형태로 내보냄 / 파일에서 가져옴
export const exportUser = () => JSON.stringify(user, null, 2);
export function importUser(text) {
  let a;
  try { a = JSON.parse(text); } catch { return "JSON 형식이 아닙니다."; }
  if (!Array.isArray(a)) return "목록(JSON 배열) 형식이어야 합니다.";
  let n = 0;
  for (const e of a) {
    if (!e || !e.ko || typeof e.en !== "string") continue;
    const err = addTerm(asList(e.ko).join(","), e.en);
    if (!err) n++;
  }
  return n ? "" : "가져올 용어가 없습니다.";
}

/* ---------- 번역에서 사용 ---------- */
// src, tgt: 번역기 언어 코드 (ko, en, ja, zh, zh-Hant)
export function maskTerms(text, src, tgt) {
  const sk = CODE[src], tk = CODE[tgt];
  const used = [];
  if (!sk || !tk) return { text, used };
  const mine = new Set(user.map((e) => koKey(e).toLowerCase()));
  const rows = [];
  for (const e of [...user, ...entries.filter((e) => !mine.has(koKey(e).toLowerCase()))]) {
    const from = asList(e[sk] ?? ""), to = asList(e[tk] ?? "");
    if (from.length && to.length) for (const f of from) rows.push({ from: f, to: to[0] });
  }
  rows.sort((a, b) => b.from.length - a.from.length); // 긴 용어부터
  let out = text;
  for (const r of rows) {
    if (used.length >= 26) break;
    if (!pattern(r.from).test(out)) continue;
    const token = `QZ${String.fromCharCode(65 + used.length)}Q`;
    out = out.replace(pattern(r.from), token);
    used.push({ token, to: r.to });
  }
  return { text: out, used };
}

// 표식이 하나라도 사라졌으면 null (호출한 쪽이 용어집 없이 다시 번역)
export function unmaskTerms(text, used) {
  let out = text;
  for (const u of used) {
    const re = () => new RegExp(u.token.split("").join("\\s*"), "gi");
    if (!re().test(out)) return null;
    out = out.replace(re(), u.to);
  }
  return out;
}
