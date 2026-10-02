import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const db = getFirestore(initializeApp(firebaseConfig));

// code: 저장용 코드, tr: 크롬 내장 번역기 언어 코드, speech: 음성인식 언어
export const LANGS = [
  { code: "en", tr: "en", name: "English", ko: "영어", speech: "en-US" },
  { code: "ja", tr: "ja", name: "日本語", ko: "일본어", speech: "ja-JP" },
  { code: "zh-CN", tr: "zh", name: "简体中文", ko: "중국어(간체)", speech: "zh-CN" },
  { code: "zh-TW", tr: "zh-Hant", name: "繁體中文", ko: "중국어(번체)", speech: "zh-TW" },
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

export function bubble({ mine, main, sub, pending, back }) {
  const el = document.createElement("div");
  el.className = `msg ${mine ? "me" : "them"}`;
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
  return el;
}
