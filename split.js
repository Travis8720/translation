// 긴 글을 문장 단위로 나눔 (번역기는 긴 글에서 품질이 떨어지기 때문)
// 소수점(3.2), 번호 목록(1. ), Mr./Dr. 같은 약어, e.g./i.e. 의 마침표에서는 나누지 않음
const DOT = "\u0001";

export function splitSentences(text) {
  const safe = text
    .replace(/(\d)\.(?=\d)/g, `$1${DOT}`)
    .replace(/(^|\n)([ \t]*\d+)\.(?=[ \t])/g, `$1$2${DOT}`)
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|vs|No|St)\./g, `$1${DOT}`)
    .replace(/\b([ei])\.([gde])\./gi, `$1${DOT}$2${DOT}`);
  return (safe.match(/[^.!?。！？\n]+[.!?。！？]*[ \t]*\n*|\n+/g) || []).map((p) => p.split(DOT).join("."));
}
