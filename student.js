import { db, LANGS, langByCode, setupMic, setupComposer, bubble } from "./common.js";
import {
  doc, getDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const input = $("input");
const sendBtn = $("send");

const roomId = new URLSearchParams(location.search).get("r");
const roomRef = roomId ? doc(db, "rooms", roomId) : null;

// 학생 화면 문구 (번역은 선생님 컴퓨터가 하므로, 화면 문구는 미리 적어 둡니다)
const STRINGS = {
  en: {
    lowconf: "The speech may not have been recognized correctly. Please check the text (red underline = possible mistake) or say it again.",
    placeholder: "Type your message", send: "Send", change: "Change language",
    intro: "Your messages are translated into Korean for your teacher.",
    empty: "Write to your teacher here. You can also tap the microphone and speak.",
    ended: "This conversation has ended. You can close this page.",
    failed: "Could not send. Please try again.",
  },
  ja: {
    lowconf: "音声が正しく認識されていない可能性があります。文を確認するか、もう一度話してください（赤い下線は間違いの可能性）。",
    placeholder: "メッセージを入力", send: "送信", change: "言語を変更",
    intro: "あなたのメッセージは先生のために韓国語に翻訳されます。",
    empty: "ここに先生へのメッセージを書いてください。マイクを押して話すこともできます。",
    ended: "この会話は終了しました。このページを閉じてください。",
    failed: "送信できませんでした。もう一度お試しください。",
  },
  "zh-CN": {
    lowconf: "语音可能没有被准确识别。请检查文字（红色下划线表示可能有错），或再说一遍。",
    placeholder: "输入消息", send: "发送", change: "更换语言",
    intro: "你的消息会被翻译成韩语给老师看。",
    empty: "在这里给老师写消息，也可以点麦克风说话。",
    ended: "对话已结束，可以关闭此页面。",
    failed: "发送失败，请再试一次。",
  },
  "zh-TW": {
    lowconf: "語音可能沒有被準確辨識。請檢查文字（紅色底線表示可能有錯），或再說一次。",
    placeholder: "輸入訊息", send: "傳送", change: "更換語言",
    intro: "你的訊息會被翻譯成韓文給老師看。",
    empty: "在這裡給老師寫訊息，也可以點麥克風說話。",
    ended: "對話已結束，可以關閉此頁面。",
    failed: "傳送失敗，請再試一次。",
  },
};
let UI = STRINGS.en;
let lang = null;
let msgsUnsub = null;
let lastMsgs = [];
let sending = false;

function notice(text) {
  $("pickView").hidden = true;
  $("chatView").hidden = true;
  $("changeBtn").hidden = true;
  $("notice").hidden = false;
  $("notice").textContent = text;
}

function saveLang(code) { try { localStorage.setItem(`lang:${roomId}`, code); } catch {} }
function loadLang() { try { return localStorage.getItem(`lang:${roomId}`); } catch { return null; } }

function render() {
  const log = $("log");
  log.replaceChildren();
  const intro = document.createElement("p");
  intro.className = "intro";
  intro.textContent = UI.intro;
  log.appendChild(intro);
  if (lastMsgs.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = UI.empty;
    log.appendChild(p);
  }
  for (const m of lastMsgs) {
    log.appendChild(bubble({ mine: m.from === "student", main: m.text_student }));
  }
  log.scrollTop = log.scrollHeight;
}

function applyUI(code) {
  UI = STRINGS[code] || STRINGS.en;
  input.placeholder = UI.placeholder;
  input.lang = code; // 브라우저 맞춤법 검사(빨간 밑줄)가 이 언어로 동작
  sendBtn.textContent = UI.send;
  $("changeBtn").textContent = UI.change;
}

function showPicker() {
  $("chatView").hidden = true;
  $("changeBtn").hidden = true;
  $("pickView").hidden = false;
  $("headTitle").textContent = "🌐 Language / 言語 / 语言";
}

async function chooseLang(code) {
  const L = langByCode(code);
  if (!L) return;
  $("pickError").textContent = "";
  document.querySelectorAll(".lang").forEach((b) => (b.disabled = true));
  try {
    await updateDoc(roomRef, { studentLang: code });
    lang = code;
    saveLang(code);
    document.documentElement.lang = code;
    applyUI(code);
    $("headTitle").textContent = `🌐 ${L.name}`;
    $("pickView").hidden = true;
    $("chatView").hidden = false;
    $("changeBtn").hidden = false;
    startMessages();
    render();
  } catch (e) {
    $("pickError").textContent = `Error: ${e.message}`;
  } finally {
    document.querySelectorAll(".lang").forEach((b) => (b.disabled = false));
  }
}

function startMessages() {
  if (msgsUnsub) return;
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("ts"));
  msgsUnsub = onSnapshot(q, (snap) => {
    lastMsgs = snap.docs.map((d) => d.data());
    render();
  }, () => {});
}

async function send() {
  const text = input.value.trim();
  if (!text || !lang || sending) return;
  sending = true;
  sendBtn.disabled = true;
  $("error").textContent = "";
  try {
    // 번역은 선생님 컴퓨터가 받아서 처리합니다
    await addDoc(collection(db, "rooms", roomId, "messages"), {
      from: "student", lang, text_student: text, text_ko: null, ts: Date.now(),
    });
    input.value = "";
    setUncertain(false);
    grow();
  } catch {
    $("error").textContent = UI.failed;
  } finally {
    sending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

for (const L of LANGS) {
  const b = document.createElement("button");
  b.className = "lang";
  const n = document.createElement("b");
  n.textContent = L.name;
  b.appendChild(n);
  b.addEventListener("click", () => chooseLang(L.code));
  $("langs").appendChild(b);
}

const grow = setupComposer(input, send);
function setUncertain(on) {
  input.classList.toggle("uncertain", !!on);
  $("micHint").hidden = !on;
  $("micHint").textContent = on ? UI.lowconf : "";
}
setupMic($("mic"), input, () => langByCode(lang)?.speech || "en-US", (ok) => setUncertain(ok === false));
input.addEventListener("input", (e) => { if (!e.isTrusted) return; setUncertain(false); }); // 직접 고치면 안내 숨김
sendBtn.addEventListener("click", send);
$("changeBtn").addEventListener("click", showPicker);

(async () => {
  if (!roomId) { notice("Please scan the QR code again. / QRコードをもう一度読み取ってください。 / 请重新扫描二维码。"); return; }
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) { notice("This conversation has ended. / この会話は終了しました。 / 对话已结束。"); return; }
  } catch {
    notice("Connection error. Please scan the QR code again.");
    return;
  }
  onSnapshot(roomRef, (s) => {
    if (!s.exists()) { msgsUnsub && msgsUnsub(); notice(UI.ended); }
  }, () => {});

  const saved = loadLang();
  if (saved && langByCode(saved)) chooseLang(saved);
  else showPicker();
})();
