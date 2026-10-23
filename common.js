import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const db = getFirestore(initializeApp(firebaseConfig));

// code: 저장용 코드, tr: 크롬 내장 번역기 언어 코드, speech: 음성인식 언어
export const LANGS = [
  { code: "en", tr: "en", name: "English", en: "English", ko: "영어", speech: "en-US" },
  { code: "ja", tr: "ja", name: "日本語", en: "Japanese", ko: "일본어", speech: "ja-JP" },
  { code: "zh-CN", tr: "zh", name: "简体中文", en: "Simplified Chinese", ko: "중국어(간체)", speech: "zh-CN" },
  { code: "zh-TW", tr: "zh-Hant", name: "繁體中文", en: "Traditional Chinese", ko: "중국어(번체)", speech: "zh-TW" },
];
export const langByCode = (c) => LANGS.find((l) => l.code === c) || null;

export function newRoomId() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(12))].map((x) => a[x % a.length]).join("");
}

// onQuality(true|false|null): 음성 인식이 끝났을 때 신뢰도가 낮으면 false (알 수 없으면 null)
export function setupMic(btn, textarea, getSpeechLang, onQuality) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.hidden = true; return; }
  let rec = null;
  btn.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = getSpeechLang();
    rec.interimResults = true; // 말하는 동안 글자를 실시간으로 보여 줌
    rec.continuous = false;
    const base = textarea.value.trim();
    if (onQuality) onQuality(null);
    rec.onresult = (e) => {
      const said = [...e.results].map((r) => r[0].transcript).join(" ");
      textarea.value = base ? `${base} ${said}` : said;
      textarea.dispatchEvent(new Event("input"));
      const last = e.results[e.results.length - 1];
      if (onQuality && last.isFinal) {
        const c = last[0].confidence; // 0이면 브라우저가 값을 주지 않은 것
        onQuality(c > 0 ? c >= 0.7 : null);
      }
    };
    rec.onend = () => { rec = null; btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); };
    rec.onerror = () => rec && rec.stop();
    rec.start();
    btn.classList.add("on");
    btn.setAttribute("aria-pressed", "true");
  });
}

export function setupComposer(textarea, onSend) {
  const grow = () => { textarea.style.height = "auto"; textarea.style.height = `${textarea.scrollHeight}px`; };
  textarea.addEventListener("input", grow);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      onSend();
    }
  });
  return grow;
}

/* ---------- 아이콘 (고정된 SVG 조각만 사용) ---------- */
const SVG = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11"/>',
  text: '<path d="M4 19 9 6l5 13M5.8 15h6.4M16 19l3-8 2 8M16.8 17h4.4"/>',
};
export function icon(name, size = 20) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  s.innerHTML = SVG[name] || "";
  return s;
}
// data-icon="이름" 이 붙은 요소 앞에 아이콘을 넣음
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.prepend(icon(el.dataset.icon, Number(el.dataset.size) || 20));
    el.removeAttribute("data-icon");
  });
}

// 글자 크기 3단계 (보통/크게/아주 크게), 브라우저에 기억
export function setupFontSize(btn) {
  const steps = [1, 1.12, 1.26];
  let i = 0;
  try { i = Math.min(steps.length - 1, Math.max(0, Number(localStorage.getItem("fs")) || 0)); } catch {}
  const apply = () => { document.documentElement.style.setProperty("--fs", steps[i]); btn.setAttribute("aria-pressed", String(i > 0)); };
  apply();
  btn.addEventListener("click", () => { i = (i + 1) % steps.length; apply(); try { localStorage.setItem("fs", i); } catch {} });
}

const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// who: 보낸 사람 이름, ts: 시각(ms), copyLabel/copiedLabel: 복사 버튼 문구
export function bubble({ mine, main, sub, pending, back, who, ts, copyLabel, copiedLabel }) {
  const wrap = document.createElement("div");
  wrap.className = `msg-wrap ${mine ? "me" : "them"}`;
  if (who || ts) {
    const meta = document.createElement("div");
    meta.className = "meta";
    if (who) { const b = document.createElement("b"); b.textContent = who; meta.appendChild(b); }
    if (ts) { const t = document.createElement("span"); t.textContent = hhmm(ts); meta.appendChild(t); }
    wrap.appendChild(meta);
  }
  const el = document.createElement("div");
  el.className = `msg ${mine ? "me" : "them"}`;
  wrap.appendChild(el);
  if (copyLabel && !pending) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "copy-btn";
    c.append(icon("copy", 14), Object.assign(document.createElement("span"), { textContent: copyLabel }));
    c.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(main); } catch { return; }
      c.replaceChildren(icon("check", 14), Object.assign(document.createElement("span"), { textContent: copiedLabel || copyLabel }));
      setTimeout(() => c.replaceChildren(icon("copy", 14), Object.assign(document.createElement("span"), { textContent: copyLabel })), 1500);
    });
    wrap.appendChild(c);
  }
  const m = document.createElement("div");
  m.className = "main" + (pending ? " pending" : "");
  m.dir = "auto";
  m.textContent = main;
  el.appendChild(m);
  if (sub) {
    const s = document.createElement("div");
    s.className = "sub";
    s.dir = "auto";
    s.textContent = sub;
    el.appendChild(s);
  }
  if (back) {
    const b = document.createElement("div");
    b.className = "back";
    b.textContent = back;
    el.appendChild(b);
  }
  return wrap;
}
