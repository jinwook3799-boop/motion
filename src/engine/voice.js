// 글자를 못 읽는 아이를 위한 음성 안내.
// 기본은 브라우저 내장 TTS. 학습 놀이처럼 발음이 중요한 문장은 미리 만든 음성 파일(sayLine)을 쓴다.
import { loadSample, playSample, stopSample } from './audio.js';

const VOICE_MAX = 12; // 음성 파일 최대 길이(초)
const lineUrl = (group, id) => `${import.meta.env.BASE_URL}voices/${group}/${id}.wav`;

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
  if (interrupt) stopSample();
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

// 미리 만든 음성 파일(public/voices/<group>/<id>.wav)로 읽는다.
// 파일이 없거나 재생할 수 없으면 text 를 TTS로 대신 읽는다.
export async function sayLine(group, id, text, { lang = 'ko-KR' } = {}) {
  stopSpeaking();
  if (await playSample(lineUrl(group, id), { max: VOICE_MAX })) return;
  await speak(text, { lang });
}

// 놀이를 시작할 때 음성 파일을 미리 받아 두어 첫 재생이 늦지 않게 한다.
export function preloadLines(group, ids) {
  for (const id of ids) loadSample(lineUrl(group, id), VOICE_MAX);
}
