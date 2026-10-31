// 모든 효과음과 악기 소리를 Web Audio API로 즉석 합성한다(외부 음원 파일 불필요, 지연 최소).
let ac = null;
let master = null;
let noiseBuffer = null;

// 브라우저는 사용자 터치 이후에만 소리를 허용하므로, 첫 터치에서 반드시 호출한다.
export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC({ latencyHint: 'interactive' });
    master = ac.createGain();
    master.gain.value = 0.7;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp).connect(ac.destination);
    noiseBuffer = makeNoise();
  }
  if (ac.state !== 'running') ac.resume();
}

function makeNoise() {
  const len = ac.sampleRate * 1.5;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

const ready = () => ac && ac.state === 'running';

function tone({ type = 'sine', freq, freqEnd, start = 0, dur = 0.3, gain = 0.4, attack = 0.005 }) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ start = 0, dur = 0.2, gain = 0.3, filter = 'bandpass', freq = 1000, q = 1, attack = 0.002 }) {
  const t = ac.currentTime + start;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  select() {
    if (!ready()) return;
    tone({ type: 'triangle', freq: 660, dur: 0.12, gain: 0.3 });
    tone({ type: 'triangle', freq: 990, start: 0.09, dur: 0.2, gain: 0.3 });
  },
  pop() {
    if (!ready()) return;
    noise({ dur: 0.12, gain: 0.6, freq: 1800, q: 0.8 });
    tone({ freq: 900, freqEnd: 200, dur: 0.15, gain: 0.35 });
    tone({ type: 'triangle', freq: 1320, start: 0.05, dur: 0.2, gain: 0.15 });
  },
  boing() {
    if (!ready()) return;
    tone({ freq: 180, freqEnd: 560, dur: 0.35, gain: 0.45 });
    tone({ type: 'triangle', freq: 360, freqEnd: 1100, dur: 0.3, gain: 0.15 });
    this.sparkle(0.15);
  },
  sparkle(start = 0) {
    if (!ready()) return;
    [1568, 2093, 2637].forEach((f, i) => tone({ freq: f, start: start + i * 0.06, dur: 0.25, gain: 0.12 }));
  },
  fanfare() {
    if (!ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'triangle', freq: f, start: i * 0.13, dur: i === 3 ? 0.8 : 0.22, gain: 0.3 }),
    );
    this.sparkle(0.55);
  },
  drum() {
    if (!ready()) return;
    tone({ freq: 160, freqEnd: 45, dur: 0.5, gain: 0.9, attack: 0.002 });
    noise({ dur: 0.07, gain: 0.35, filter: 'lowpass', freq: 1200 });
  },
  xylophone(freq) {
    if (!ready()) return;
    tone({ freq, dur: 0.9, gain: 0.45, attack: 0.002 });
    tone({ freq: freq * 3.98, dur: 0.12, gain: 0.12, attack: 0.001 });
    tone({ type: 'triangle', freq: freq * 2, dur: 0.3, gain: 0.08 });
  },
  cymbal() {
    if (!ready()) return;
    noise({ dur: 1.4, gain: 0.35, filter: 'highpass', freq: 6000, q: 0.5 });
    noise({ dur: 0.8, gain: 0.2, freq: 9000 });
    [3150, 4370, 5210].forEach((f) => tone({ type: 'square', freq: f, dur: 0.6, gain: 0.02 }));
  },
  success() {
    if (!ready()) return;
    [659.25, 783.99, 1046.5].forEach((f, i) => tone({ type: 'triangle', freq: f, start: i * 0.1, dur: 0.3, gain: 0.3 }));
    this.sparkle(0.3);
  },
  // 틀렸을 때도 혼내는 느낌 없이 부드럽게
  oops() {
    if (!ready()) return;
    tone({ type: 'triangle', freq: 440, dur: 0.18, gain: 0.25 });
    tone({ type: 'triangle', freq: 349.23, start: 0.16, dur: 0.3, gain: 0.25 });
  },
  footstep() {
    if (!ready()) return;
    tone({ freq: 220, freqEnd: 90, dur: 0.18, gain: 0.6, attack: 0.002 });
    tone({ type: 'triangle', freq: 880, start: 0.03, dur: 0.15, gain: 0.12 });
  },
  freeze() {
    if (!ready()) return;
    [2637, 2349, 1976, 1568, 1319].forEach((f, i) => tone({ freq: f, start: i * 0.05, dur: 0.4, gain: 0.1 }));
    noise({ dur: 0.5, gain: 0.12, filter: 'highpass', freq: 8000 });
  },
  bloop() {
    if (!ready()) return;
    tone({ freq: 300, freqEnd: 750, dur: 0.16, gain: 0.4 });
  },
  twinkle() {
    if (!ready()) return;
    tone({ freq: 1800 + Math.random() * 1200, dur: 0.12, gain: 0.04 });
  },
  whoosh() {
    if (!ready()) return;
    noise({ dur: 0.35, gain: 0.2, freq: 1200, q: 0.6, attack: 0.12 });
  },
};

// 녹음된 소리(동물 울음소리 등). 앞뒤 무음을 잘라 내고 크기를 맞춰 재생한다.
const SAMPLE_WINDOW = 0.05; // 초
const SAMPLE_THRESHOLD = 0.15; // 가장 큰 구간 대비 이 비율 이상부터 '소리'로 본다
const SAMPLE_MAX = 3; // 긴 녹음은 앞부분만(초)
const samples = new Map();
let currentSample = null;

// 50ms 구간별 소리 크기(RMS)로 소리가 시작·끝나는 곳을 찾는다(순간 잡음에 덜 흔들린다).
function analyseSample(buffer) {
  const data = buffer.getChannelData(0);
  const win = Math.floor(buffer.sampleRate * SAMPLE_WINDOW);
  let peak = 0;
  const rms = [];
  for (let i = 0; i < data.length; i += win) {
    let sum = 0;
    const end = Math.min(data.length, i + win);
    for (let j = i; j < end; j++) {
      sum += data[j] * data[j];
      peak = Math.max(peak, Math.abs(data[j]));
    }
    rms.push(Math.sqrt(sum / (end - i)));
  }
  const thr = Math.max(...rms) * SAMPLE_THRESHOLD;
  let first = rms.findIndex((v) => v > thr);
  if (first < 0) first = 0;
  // 최대 길이 안에서 마지막으로 소리가 난 곳까지만 재생해, 뒤에 남는 무음을 없앤다.
  let last = Math.min(rms.length - 1, first + Math.floor(SAMPLE_MAX / SAMPLE_WINDOW));
  while (last > first && rms[last] <= thr) last--;
  const offset = Math.max(0, first * SAMPLE_WINDOW - 0.03);
  return { buffer, offset, duration: (last + 1) * SAMPLE_WINDOW + 0.1 - offset, gain: Math.min(3, 0.9 / (peak || 1)) };
}

export function loadSample(url) {
  if (!ac) return Promise.resolve(null);
  if (!samples.has(url)) {
    const p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url} (${res.status})`);
        return res.arrayBuffer();
      })
      .then((bytes) => ac.decodeAudioData(bytes))
      .then(analyseSample)
      .catch((err) => {
        console.warn('소리 파일을 불러오지 못했습니다:', err);
        samples.delete(url);
        return null;
      });
    samples.set(url, p);
  }
  return samples.get(url);
}

export function stopSample() {
  try {
    currentSample?.stop();
  } catch {
    // 이미 끝난 소리
  }
  currentSample = null;
}

// 끝까지 재생되면(또는 중간에 멈추면) true, 재생할 수 없으면 false 로 resolve 된다.
export async function playSample(url) {
  const s = await loadSample(url);
  if (!s || !ready()) return false;
  stopSample();
  const t = ac.currentTime;
  const dur = s.duration;
  const src = ac.createBufferSource();
  src.buffer = s.buffer;
  const g = ac.createGain();
  g.gain.setValueAtTime(s.gain, t);
  g.gain.setValueAtTime(s.gain, t + Math.max(0, dur - 0.2));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(master);
  src.start(t, s.offset, dur);
  currentSample = src;
  return new Promise((resolve) => {
    src.onended = () => {
      if (currentSample === src) currentSample = null;
      resolve(true);
    };
  });
}

// 신호등 놀이용 신나는 반복 음악(룩어헤드 스케줄러로 박자를 정확히 맞춘다)
const MELODY = [523.25, 0, 659.25, 0, 783.99, 659.25, 0, 523.25, 587.33, 0, 698.46, 0, 880, 698.46, 0, 587.33];
const BASS = [130.81, 0, 0, 0, 196, 0, 0, 0, 146.83, 0, 0, 0, 220, 0, 0, 0];
const STEP = 60 / 132 / 2;
let musicTimer = null;

export const music = {
  start() {
    if (!ready() || musicTimer) return;
    let step = 0;
    let next = ac.currentTime + 0.05;
    musicTimer = setInterval(() => {
      while (next < ac.currentTime + 0.12) {
        const s = step % MELODY.length;
        const at = Math.max(0, next - ac.currentTime);
        if (MELODY[s]) tone({ type: 'square', freq: MELODY[s], start: at, dur: STEP * 0.9, gain: 0.06 });
        if (BASS[s]) tone({ type: 'triangle', freq: BASS[s], start: at, dur: STEP * 3, gain: 0.25 });
        if (s % 4 === 0) noise({ start: at, dur: 0.05, gain: 0.12, filter: 'highpass', freq: 7000 });
        next += STEP;
        step++;
      }
    }, 25);
  },
  stop() {
    clearInterval(musicTimer);
    musicTimer = null;
  },
};
