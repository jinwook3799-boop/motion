// 글자를 못 읽는 아이를 위한 음성 안내. 브라우저 내장 한국어 TTS를 쓴다.
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
const voices = { ko: null, en: null };

function pickVoice() {
  const all = speechSynthesis.getVoices();
  const find = (lang, prefix) =>
    all.find((v) => v.lang === lang && /google/i.test(v.name)) ||
    all.find((v) => v.lang === lang) ||
    all.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ||
    null;
  voices.ko = find('ko-KR', 'ko');
  voices.en = find('en-US', 'en');
}

if (supported) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

// 말이 끝나면 resolve 되는 Promise를 돌려준다(음성이 끊기거나 이벤트가 안 와도 시간 초과로 resolve).
// lang: 'ko-KR'(기본) 또는 'en-US'(알파벳 읽기)
export function speak(text, { interrupt = true, lang = 'ko-KR' } = {}) {
  if (!supported) return Promise.resolve();
  if (interrupt) speechSynthesis.cancel();
  return new Promise((resolve) => {
    const english = lang.startsWith('en');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voice = english ? voices.en : voices.ko;
    if (voice) u.voice = voice;
    u.rate = english ? 0.8 : 0.95;
    u.pitch = english ? 1.1 : 1.25;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, 1500 + text.length * 200);
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (supported) speechSynthesis.cancel();
}
