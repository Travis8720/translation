import { db, LANGS, langByCode, newRoomId, setupMic, setupComposer, bubble } from "./common.js";
import {
  doc, setDoc, getDoc, deleteDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, getDocs, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const input = $("input");
const sendBtn = $("send");
const micBtn = $("mic");

let roomId = null;
let studentLang = null;
let unsubs = [];
let sending = false;
let lastMsgs = [];
const inflight = new Set();

/* ---------- 크롬 내장 번역기 ---------- */
const hasTranslator = "Translator" in self;
const trCache = new Map();

function getTranslator(src, tgt) {
  const k = `${src}>${tgt}`;
  if (!trCache.has(k)) {
    const p = Translator.create({ sourceLanguage: src, targetLanguage: tgt });
    p.catch(() => trCache.delete(k));
    trCache.set(k, p);
  }
  return trCache.get(k);
}

async function tr(text, src, tgt) {
  if (!hasTranslator) throw new Error("이 브라우저는 내장 번역을 지원하지 않습니다");
  try {
    return await (await getTranslator(src, tgt)).translate(text);
  } catch (e) {
    // 직접 번역이 안 되는 언어쌍이면 영어를 거쳐서 번역
    if (src !== "en" && tgt !== "en") {
      const mid = await (await getTranslator(src, "en")).translate(text);
      return await (await getTranslator("en", tgt)).translate(mid);
    }
    throw e;
  }
}

async function checkAvailability() {
  const list = $("checks");
  if (!hasTranslator) { $("noSupport").hidden = false; list.hidden = true; return; }
  list.replaceChildren();
  for (const L of LANGS) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${L.ko} (${L.name})`;
    const st = document.createElement("span");
    li.append(name, st);
    list.appendChild(li);
    try {
      const [a, b] = await Promise.all([
        Translator.availability({ sourceLanguage: "ko", targetLanguage: L.tr }),
        Translator.availability({ sourceLanguage: L.tr, targetLanguage: "ko" }),
      ]);
      if (a === "available" && b === "available") { st.textContent = "사용 가능"; st.className = "ok"; }
      else if (a === "unavailable" || b === "unavailable") { st.textContent = "이 컴퓨터에서 지원 안 됨"; st.className = "no"; }
      else { st.textContent = "시작할 때 내려받음"; st.className = "dl"; }
    } catch {
      st.textContent = "확인 실패"; st.className = "no";
    }
  }
}

// 버튼 클릭 직후(사용자 동작 안)에 모든 번역 모델 준비를 한꺼번에 시작해야 다운로드가 허용됩니다.
// 직접 번역이 안 되는 언어쌍은 영어를 거치므로 영어 모델도 함께 준비합니다.
async function prepareAll() {
  const pairs = [];
  for (const L of LANGS) {
    pairs.push(["ko", L.tr], [L.tr, "ko"]);
    if (L.tr !== "en") pairs.push(["ko", "en"], ["en", "ko"], ["en", L.tr], [L.tr, "en"]);
  }
  const uniq = [...new Map(pairs.map((p) => [p.join(">"), p])).values()];
  const res = await Promise.allSettled(uniq.map(([s, t]) => getTranslator(s, t)));
  return uniq.filter((_, i) => res[i].status === "rejected").map((p) => p.join("→"));
}

/* ---------- 대화방 ---------- */
const studentUrl = (id) =>
  `${location.origin}${location.pathname.replace(/[^/]*$/, "")}student.html?r=${id}`;
const showError = (msg) => { $("error").textContent = msg || ""; };

function setInputEnabled(on) {
  input.disabled = !on;
  micBtn.disabled = !on;
  sendBtn.disabled = !on || sending;
  input.placeholder = on
    ? "한국어로 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"
    : "학생이 접속하면 입력할 수 있습니다";
}

function render() {
  const log = $("log");
  log.replaceChildren();
  if (lastMsgs.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = studentLang
      ? "학생이 접속했습니다. 먼저 인사를 건네 보세요."
      : "학생이 QR코드로 접속하고 언어를 고르면 여기에 대화가 표시됩니다.";
    log.appendChild(p);
    return;
  }
  for (const m of lastMsgs) {
    if (m.from === "teacher") {
      log.appendChild(bubble({ mine: true, main: m.text_ko, sub: m.text_student }));
    } else {
      const done = typeof m.text_ko === "string";
      log.appendChild(bubble({ mine: false, main: done ? m.text_ko : "번역 중…", sub: m.text_student, pending: !done }));
    }
  }
  log.scrollTop = log.scrollHeight;
}

// 학생이 보낸 메시지를 이 컴퓨터에서 한국어로 번역해 저장
function translatePending(docs) {
  for (const d of docs) {
    const m = d.data();
    if (m.from !== "student" || typeof m.text_ko === "string" || inflight.has(d.id)) continue;
    const L = langByCode(m.lang);
    if (!L) continue;
    inflight.add(d.id);
    tr(m.text_student, L.tr, "ko")
      .then((t) => updateDoc(d.ref, { text_ko: t }))
      .catch((e) => showError(`학생 메시지를 번역하지 못했습니다: ${e.message}`))
      .finally(() => inflight.delete(d.id));
  }
}

async function openRoom(id, isNew) {
  roomId = id;
  history.replaceState(null, "", `#r=${id}`);
  if (isNew) await setDoc(doc(db, "rooms", id), { createdAt: Date.now(), studentLang: null });

  $("qr").replaceChildren();
  new QRCode($("qr"), { text: studentUrl(id), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
  $("link").textContent = studentUrl(id);
  $("startView").hidden = true;
  $("sessionView").hidden = false;

  unsubs.push(onSnapshot(doc(db, "rooms", id), (snap) => {
    if (!snap.exists()) { closeLocal(); return; }
    studentLang = snap.data().studentLang || null;
    const L = langByCode(studentLang);
    const st = $("status");
    st.textContent = L ? `학생 접속됨: ${L.ko} (${L.name})` : "학생 접속을 기다리는 중";
    st.classList.toggle("live", !!L);
    setInputEnabled(!!L);
    render();
  }, (e) => showError(`연결 오류: ${e.message}`)));

  const q = query(collection(db, "rooms", id, "messages"), orderBy("ts"));
  unsubs.push(onSnapshot(q, (snap) => {
    lastMsgs = snap.docs.map((d) => d.data());
    render();
    translatePending(snap.docs);
  }, (e) => showError(`연결 오류: ${e.message}`)));
}

function closeLocal() {
  unsubs.forEach((u) => u());
  unsubs = [];
  roomId = null;
  studentLang = null;
  lastMsgs = [];
  history.replaceState(null, "", location.pathname);
  $("log").replaceChildren();
  input.value = "";
  showError("");
  $("sessionView").hidden = true;
  $("startView").hidden = false;
  checkAvailability();
}

async function send() {
  const text = input.value.trim();
  const L = langByCode(studentLang);
  if (!text || !L || sending) return;
  sending = true;
  setInputEnabled(true);
  showError("");
  try {
    const translated = await tr(text, "ko", L.tr);
    await addDoc(collection(db, "rooms", roomId, "messages"), {
      from: "teacher", lang: L.code, text_ko: text, text_student: translated, ts: Date.now(),
    });
    input.value = "";
    grow();
  } catch (e) {
    showError(`보내지 못했습니다: ${e.message}`);
  } finally {
    sending = false;
    setInputEnabled(!!studentLang);
    input.focus();
  }
}

async function endRoom() {
  if (!roomId) return;
  if (!confirm("대화를 끝내면 이 대화 기록이 모두 삭제되고 학생 화면도 종료됩니다. 계속할까요?")) return;
  const id = roomId;
  try {
    const msgs = await getDocs(collection(db, "rooms", id, "messages"));
    let batch = writeBatch(db);
    let n = 0;
    for (const d of msgs.docs) {
      batch.delete(d.ref);
      if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();
    await deleteDoc(doc(db, "rooms", id));
    closeLocal();
  } catch (e) {
    showError(`삭제하지 못했습니다: ${e.message}`);
  }
}

const grow = setupComposer(input, send);
setupMic(micBtn, input, () => "ko-KR");
sendBtn.addEventListener("click", send);
$("endBtn").addEventListener("click", endRoom);

$("startBtn").addEventListener("click", async () => {
  const btn = $("startBtn");
  $("startError").textContent = "";
  if (!hasTranslator) {
    $("startError").textContent = "컴퓨터용 크롬 최신 버전에서 열어야 합니다.";
    return;
  }
  const preparing = prepareAll(); // 반드시 await 전에 호출
  btn.disabled = true;
  btn.textContent = "번역 모델 준비 중… (처음에는 몇 분 걸릴 수 있습니다)";
  try {
    const failed = await preparing;
    await openRoom(newRoomId(), true);
    if (failed.length) showError(`일부 번역 모델을 준비하지 못했습니다: ${failed.join(", ")}`);
  } catch (e) {
    $("startError").textContent = `대화를 만들지 못했습니다: ${e.message} (firebase-config.js 설정을 확인하세요)`;
  } finally {
    btn.disabled = false;
    btn.textContent = "번역 준비하고 새 대화 시작";
    checkAvailability();
  }
});

checkAvailability();

// 새로고침해도 진행 중이던 대화로 돌아오기 (이미 내려받은 모델은 바로 사용됨)
const m = location.hash.match(/r=([a-z0-9]{10,})/);
if (m) {
  getDoc(doc(db, "rooms", m[1]))
    .then((s) => (s.exists() ? openRoom(m[1], false) : history.replaceState(null, "", location.pathname)))
    .catch(() => {});
}
