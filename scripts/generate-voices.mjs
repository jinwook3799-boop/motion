// 학습 놀이(알파벳·한글)용 자연스러운 음성 파일을 Gemini TTS로 만든다.
//
//   1) 프로젝트 폴더에 .env.local 파일을 만들고 GEMINI_API_KEY=발급받은키 를 적는다(git에 올라가지 않음).
//   2) npm run voices
//
// 결과는 public/voices/<letters|words|phrases>/<id>.wav. 이미 있는 파일은 건너뛰므로,
// 마음에 들지 않는 파일만 지우고 다시 실행하면 그 파일만 새로 만든다.
// 무료 등급의 요청 수 제한을 아끼려고 알파벳·낱말은 한 번에 묶어 만든 뒤 무음 구간에서 나눈다.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTERS, PHRASES, WORDS } from '../src/engine/voiceLines.js';
import { countPauses, seconds, split, toWav, trim } from './lib/pcm.mjs';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = process.env.GEMINI_API_KEY;
const VOICE = process.env.GEMINI_TTS_VOICE || 'Leda'; // 밝고 젊은 목소리
const RATE = 24000; // Gemini TTS 출력: 24kHz 16bit 모노 PCM
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'voices');

// TTS 모델은 "한 줄 지시: 읽을 글" 형식만 받는다(지시가 길면 글을 쓰려다 400 오류).
const STYLE_EN = 'Say clearly and warmly, like a friendly native American English teacher talking to a young child';
const STYLE_KO = 'Say in warm, cheerful, natural standard Korean, like a kindergarten teacher talking to a young child';
const PAUSE = ' … '; // 묶음으로 읽을 때 낱말 사이의 쉼

class DailyQuotaError extends Error {}
class TextOnlyError extends Error {} // 모델이 지시를 글쓰기 요청으로 받아들여 거부함

if (!KEY) {
  console.error('GEMINI_API_KEY 가 없습니다. 프로젝트 폴더의 .env.local 파일에 GEMINI_API_KEY=... 를 넣어 주세요.');
  process.exit(1);
}

const headers = { 'x-goog-api-key': KEY, 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 사용 가능한 TTS 모델을 찾는다(모델 이름이 바뀌어도 동작하도록). GEMINI_TTS_MODEL 로 직접 지정할 수도 있다.
async function pickModel() {
  if (process.env.GEMINI_TTS_MODEL) return `models/${process.env.GEMINI_TTS_MODEL.replace(/^models\//, '')}`;
  const res = await fetch(`${API}/models?pageSize=1000`, { headers });
  if (!res.ok) throw new Error(`모델 목록을 가져오지 못했습니다 (${res.status}). API 키를 확인해 주세요.`);
  const { models = [] } = await res.json();
  const tts = models
    .filter((m) => /tts/i.test(m.name) && m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name);
  if (!tts.length) throw new Error('사용할 수 있는 Gemini TTS 모델이 없습니다.');
  return tts.find((n) => /flash/i.test(n)) ?? tts[0];
}

async function synth(model, text) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${model}:generateContent`, { method: 'POST', headers, body });
    if (res.ok) {
      const json = await res.json();
      const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
      // 가끔 음성 없이 응답한다(지시를 글쓰기로 오해하는 등) → 다른 방식으로 다시 시도하게 한다.
      if (!data) throw new TextOnlyError(`음성 없는 응답 (${json.candidates?.[0]?.finishReason ?? '이유 없음'})`);
      const buf = Buffer.from(data, 'base64');
      return new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    }
    const err = await res.json().catch(() => ({}));
    const message = err.error?.message ?? '';
    if (res.status === 429) {
      if (/per ?day|daily/i.test(message)) throw new DailyQuotaError(message);
      const retry = err.error?.details?.find((d) => d.retryDelay)?.retryDelay;
      const wait = retry ? parseFloat(retry) * 1000 + 1000 : 30000;
      if (attempt <= 6) {
        console.log(`  요청 한도에 걸려 ${Math.round(wait / 1000)}초 기다립니다...`);
        await sleep(wait);
        continue;
      }
    }
    if (res.status >= 500 && attempt <= 3) {
      await sleep(5000);
      continue;
    }
    if (res.status === 400 && /generate text/i.test(message)) throw new TextOnlyError(message);
    throw new Error(`Gemini 오류 (${res.status}): ${message}`);
  }
}

// "말투 지시: 읽을 글"로 요청하고, 거부되면 읽을 글만 보내는 방식과 번갈아 몇 번 더 시도한다.
async function tts(model, style, transcript) {
  const tries = [`${style}: ${transcript}`, transcript, `${style}: ${transcript}`, transcript];
  for (let i = 0; ; i++) {
    try {
      return await synth(model, tries[i]);
    } catch (err) {
      if (!(err instanceof TextOnlyError) || i === tries.length - 1) throw err;
    }
  }
}

function save(group, id, pcm) {
  mkdirSync(join(OUT, group), { recursive: true });
  writeFileSync(join(OUT, group, `${id}.wav`), toWav(pcm, RATE));
  console.log(`  ✓ ${group}/${id}.wav (${seconds(pcm, RATE).toFixed(2)}초)`);
}

const missing = (group, ids) => ids.filter((id) => !existsSync(join(OUT, group, `${id}.wav`)));

// 묶음 하나로 만들어 낱개로 나눈다. 실패하면 false(하나씩 만들기로 넘어감).
async function makeBatch(model, group, items, style) {
  console.log(`- ${group}: ${items.length}개를 한 번에 만드는 중...`);
  let pcm;
  try {
    pcm = await tts(model, `${style}, with a pause between each`, items.map((it) => it.text).join(PAUSE));
  } catch (err) {
    if (!(err instanceof TextOnlyError)) throw err;
    console.log('  묶음 요청이 거절되어 하나씩 만듭니다.');
    return false;
  }
  const pieces = split(pcm, RATE, items.length);
  if (!pieces) {
    console.log(`  쉼이 ${countPauses(pcm, RATE)}곳 들려 ${items.length}개로 나눌 수 없어 하나씩 만듭니다.`);
    return false;
  }
  items.forEach((it, i) => save(group, it.id, pieces[i]));
  return true;
}

async function makeEach(model, group, items, style) {
  console.log(`- ${group}: ${items.length}개를 하나씩 만드는 중...`);
  for (const it of items) save(group, it.id, trim(await tts(model, style, it.text), RATE));
}

const GROUPS = [
  { group: 'letters', items: LETTERS.map((l) => ({ id: l, text: `${l}.` })), style: STYLE_EN, batch: true },
  { group: 'words', items: Object.entries(WORDS).map(([id, text]) => ({ id, text: `${text}.` })), style: STYLE_KO, batch: true },
  { group: 'phrases', items: Object.entries(PHRASES).map(([id, text]) => ({ id, text })), style: STYLE_KO },
];

try {
  const model = await pickModel();
  console.log(`모델: ${model.replace('models/', '')}, 목소리: ${VOICE}`);
  for (const g of GROUPS) {
    const todo = missing(g.group, g.items.map((it) => it.id));
    if (!todo.length) {
      console.log(`- ${g.group}: 모두 있음`);
      continue;
    }
    const items = g.items.filter((it) => todo.includes(it.id));
    const batched = g.batch && items.length > 2 && (await makeBatch(model, g.group, items, g.style));
    if (!batched) await makeEach(model, g.group, items, g.style);
  }
  console.log('완료! public/voices 의 파일을 들어 보고, 마음에 들지 않는 파일은 지운 뒤 다시 실행하세요.');
} catch (err) {
  if (err instanceof DailyQuotaError) {
    console.error('오늘의 무료 사용 한도를 다 썼습니다. 만든 파일은 저장되어 있으니 내일 다시 실행하면 이어서 만듭니다.');
  } else {
    console.error(err.message);
  }
  process.exit(1);
}
