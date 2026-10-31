// 글자를 못 읽는 아이를 위한 음성 안내. 브라우저 내장 한국어 TTS를 쓴다.
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
let koVoice = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  koVoice =
    voices.find((v) => v.lang === 'ko-KR' && /google/i.test(v.name)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('ko')) ||
    null;
}

if (supported) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

// 말이 끝나면 resolve 되는 Promise를 돌려준다(음성이 끊기거나 이벤트가 안 와도 시간 초과로 resolve).
export function speak(text, { interrupt = true } = {}) {
  if (!supported) return Promise.resolve();
  if (interrupt) speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (koVoice) u.voice = koVoice;
    u.rate = 0.95;
    u.pitch = 1.25;
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
