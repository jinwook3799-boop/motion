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
};
