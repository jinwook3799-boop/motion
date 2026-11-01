import { HoverButton } from '../engine/HoverButton.js';
import { note, playIcon, smile, star, COLORS } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { sweepPoints } from '../engine/hit.js';
import { firework } from './common.js';

const GOAL = 10; // 한 단계에서 채울 별(잘 친 수)
const WINDOW = 0.3; // 음표가 북에 닿는 순간 앞뒤로 이 시간(초) 안에 치면 성공
const PERFECT = 0.12; // 이 시간(초) 안이면 '딱 맞음' — 반짝임을 더 준다
const RETRIGGER = 0.15; // 같은 손이 같은 북을 다시 울리는 최소 간격(초)
const TRAVEL_BEATS = 3; // 음표가 나타나서 북까지 내려오는 박자 수
const COUNT_IN = 4; // 시작 전에 음악만 들려주는 박자 수
const MISS_VOICE_AFTER = 6; // 연속으로 이만큼 놓치면 방법을 다시 알려 준다
const MISS_VOICE_GAP = 15; // 위 안내의 최소 간격(초)
const STRIKE_PARTS = new Set(['tip', 'palm']);
// 단계별 난이도: bpm = 빠르기, drums = 북 수, pattern = 8박(두 마디) 동안 음표가 나오는 박(0~7, .5 = 반 박)과 북(0=왼쪽, 1=오른쪽)
const LEVELS = [
  { bpm: 90, drums: 1, pattern: [[0, 0], [2, 0], [4, 0], [6, 0]] },
  { bpm: 92, drums: 1, pattern: [[0, 0], [1, 0], [2, 0], [4, 0], [5, 0], [6, 0]] },
  { bpm: 94, drums: 2, pattern: [[0, 0], [2, 1], [4, 0], [6, 1]] },
  { bpm: 96, drums: 2, pattern: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 0], [6, 1], [7, 1]] },
  { bpm: 100, drums: 2, pattern: [[0, 0], [1, 1], [2, 0], [2.5, 0], [3, 1], [4, 1], [5, 0], [6, 1], [6.5, 1], [7, 0]] },
];
// 반주: 8박(반 박씩 16칸) 동안 도는 밝은 실로폰 가락(직접 만든 짧은 노래). 0 = 쉼
const C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880;
const MELODY = [C5, 0, E5, G5, A5, 0, G5, 0, E5, 0, D5, E5, C5, 0, 0, 0, D5, 0, E5, D5, C5, 0, A4, 0, G4, 0, A4, C5, D5, 0, 0, 0];
const BASS = [C4, 0, 0, 0, G4, 0, 0, 0, A4, 0, 0, 0, E4, 0, 0, 0, D4, 0, 0, 0, G4, 0, 0, 0, C4, 0, 0, 0, G4, 0, D4, 0];
const DRUM_COLORS = [COLORS.red, COLORS.blue];

// 리듬 북 치기: 음악에 맞춰 내려오는 음표가 북에 닿을 때 손으로 북을 친다. 놓쳐도 아무 일 없다.
export class RhythmScene {
  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.begin(), ringColor: COLORS.green });
    this.drums = [];
  }

  onResize() {
    const { w, h, unit, zone: z } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
    this.layout();
  }

  // 북 자리: 아래 가운데(왼쪽 아래 집 버튼과 떨어지게). 북이 하나면 가운데에 하나.
  layout() {
    const { w, unit, zone: z } = this.game;
    const n = this.level && LEVELS[this.level - 1].drums === 2 ? 2 : 1;
    const r = Math.min(unit * 0.12, z.w * 0.12);
    const y = z.y + z.h * 0.74;
    const xs = n === 1 ? [w / 2] : [w / 2 - Math.min(z.w * 0.2, unit * 0.32), w / 2 + Math.min(z.w * 0.2, unit * 0.32)];
    this.drums = xs.map((x, i) => ({ x, y, r, color: DRUM_COLORS[i], hit: this.drums[i]?.hit ?? 0, glow: 0 }));
    this.noteR = r * 0.42;
    this.topY = z.y + unit * 0.27; // 음표가 나타나는 높이(별 게이지·단계 표시 아래)
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'ready';
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.notes = [];
    this.inside = new Map(); // 손 → 지금 들어가 있는 북 번호
    this.lastStrike = new Map();
    this.misses = 0;
    this.lastMissVoice = -Infinity;
    this.layout();
    speak('가운데 동그라미에 손을 올리면 시작해요!');
  }

  exit() {
    this.active = false;
  }

  after(promise, fn) {
    const token = ++this.token;
    promise.then(() => {
      if (this.active && this.token === token) fn();
    });
  }

  get cfg() {
    return LEVELS[this.level - 1];
  }

  get beat() {
    return 60 / this.cfg.bpm;
  }

  begin() {
    sfx.select();
    this.state = 'intro';
    this.after(speak(this.level === 1 ? '음표가 북에 닿을 때 콩! 쳐요!' : '시작!'), () => this.startMusic());
  }

  startMusic() {
    this.state = 'play';
    this.t = 0; // 음악 시간(초)
    this.step = -1; // 반 박 단위로 지금까지 연주한 칸
    this.nextBar = COUNT_IN; // 다음에 음표를 만들 두 마디(8박)의 시작 박
    this.notes = [];
    this.misses = 0;
  }

  onTap(x, y) {
    if (this.state === 'ready') return this.startButton.tap(x, y);
    const i = this.drums.findIndex((d) => Math.hypot(x - d.x, y - d.y) < d.r * 1.3);
    if (i >= 0) this.strike(i, { x, y }, 'tap');
  }

  update(dt, input) {
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    for (const d of this.drums) {
      d.hit = Math.max(0, d.hit - dt * 4);
      d.glow = Math.max(0, d.glow - dt * 3);
    }
    if (this.state === 'ready') {
      this.startButton.update(dt, input.pointers);
      return;
    }
    this.detectStrikes(input.pointers);
    if (this.state === 'intro') return;

    this.t += dt;
    this.playMusic();
    this.makeNotes();

    // 지나간 음표: 그냥 사라진다(혼내지 않음). 연속으로 많이 놓치면 다정하게 다시 알려 준다.
    for (const n of this.notes) {
      if (!n.done && this.t - n.time > WINDOW) {
        n.done = 'miss';
        n.doneT = this.t;
        this.misses++;
      }
    }
    this.notes = this.notes.filter((n) => !n.done || this.t - n.doneT < 0.6);
    if (this.misses >= MISS_VOICE_AFTER && this.game.time - this.lastMissVoice > MISS_VOICE_GAP) {
      this.lastMissVoice = this.game.time;
      this.misses = 0;
      speak('음표가 북에 닿을 때 손으로 콩! 쳐요.', { interrupt: false });
    }

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.4;
        firework(this.game);
      }
      if (this.stateT <= 0) this.nextLevel();
    }
  }

  // 반주: 반 박마다 가락, 박마다 베이스, 엇박마다 '칙' 소리
  playMusic() {
    const half = this.beat / 2;
    const step = Math.floor(this.t / half);
    while (this.step < step) {
      this.step++;
      const i = this.step % MELODY.length;
      if (MELODY[i]) sfx.xylophone(MELODY[i]);
      if (BASS[i]) sfx.xylophone(BASS[i] / 2);
      if (this.step % 2 === 1) sfx.chug();
      // 박마다 북 테두리가 살짝 빛나 박자를 눈으로도 보여 준다.
      if (this.step % 2 === 0) for (const d of this.drums) d.glow = 1;
    }
  }

  // 음표는 북에 닿을 시각보다 TRAVEL_BEATS 박 먼저 위에서 나타난다. 축하 중에는 만들지 않는다.
  makeNotes() {
    const beat = this.beat;
    while ((this.nextBar - TRAVEL_BEATS - 1) * beat <= this.t) {
      if (this.state === 'play') {
        for (const [b, drum] of this.cfg.pattern) {
          if (drum >= this.drums.length) continue;
          this.notes.push({ time: (this.nextBar + b) * beat, drum, done: null, doneT: 0 });
        }
      }
      this.nextBar += 8;
    }
  }

  // 손이 북 밖에서 안으로 들어오는 순간 '콩'. 손 하나의 여러 점(손끝·손바닥)은 한 번으로 친다.
  detectStrikes(pointers) {
    const now = new Map();
    const struck = new Set();
    for (const p of pointers) {
      if (!STRIKE_PARTS.has(p.part)) continue;
      const hand = p.key.split('-')[0];
      const prev = this.inside.get(hand);
      for (const q of sweepPoints(p, this.game.unit * 0.03)) {
        const i = this.drumAt(q);
        if (i < 0) continue;
        if (!now.has(hand)) now.set(hand, i);
        if (i !== prev && !struck.has(`${hand}:${i}`)) {
          struck.add(`${hand}:${i}`);
          this.strike(i, q, hand);
        }
        break;
      }
    }
    // 들어가 있던 손은 한 점이라도 북 안에 남아 있으면 계속 안에 있는 것으로 본다.
    this.inside = now;
  }

  drumAt(p) {
    const home = this.game.homeButton;
    if (home.contains(p, home.r * 0.15)) return -1;
    return this.drums.findIndex((d) => Math.abs(p.x - d.x) < d.r * 1.25 && p.y > d.y - d.r * 1.1 && p.y < d.y + d.r * 1.0);
  }

  strike(i, p, hand) {
    const key = `${hand}:${i}`;
    const t = this.game.time;
    if (t - (this.lastStrike.get(key) ?? -Infinity) < RETRIGGER) return;
    this.lastStrike.set(key, t);
    const d = this.drums[i];
    if (!d) return;
    d.hit = 1;
    sfx.drum();
    const { particles, unit } = this.game;
    const top = d.y - d.r * 0.35;
    particles.ring(d.x, top, { color: d.color, size: d.r * 0.7 });
    if (this.state !== 'play' && this.state !== 'celebrate') return;

    // 가장 가까운 음표를 찾아 맞았는지 본다.
    let best = null;
    for (const n of this.notes) {
      if (n.done || n.drum !== i) continue;
      const off = Math.abs(n.time - this.t);
      if (off <= WINDOW && (!best || off < best.off)) best = { n, off };
    }
    if (!best) return; // 아무 때나 쳐도 소리는 난다(자유 연주)
    best.n.done = 'hit';
    best.n.doneT = this.t;
    this.misses = 0;
    const perfect = best.off <= PERFECT;
    particles.burst(d.x, top, { count: 8, colors: [d.color, COLORS.purple, COLORS.pink], speed: unit * 0.4, size: unit * 0.04, shape: 'note', gravity: -unit * 0.4, life: 1.1 });
    if (perfect) {
      sfx.sparkle();
      particles.burst(d.x, top, { count: 16, colors: [COLORS.yellow, '#fff'], speed: unit * 0.65, size: unit * 0.022, shape: 'star', gravity: 150 });
    }
    if (this.state !== 'play') return;
    this.pulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) this.celebrate();
  }

  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    sfx.fanfare();
    const next = LEVELS[this.level];
    this.after(
      speak(last ? '5단계까지 모두 성공! 최고의 북 연주자예요!' : next.drums > this.cfg.drums ? `와! ${this.level + 1}단계! 이제 북이 두 개! 양손으로 쳐요!` : `와! ${this.level + 1}단계! 조금 더 많이 쳐요!`),
      () => {},
    );
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    this.notes = [];
    if (this.level >= LEVELS.length) {
      this.level = 1;
      this.layout();
      this.state = 'ready';
      return;
    }
    this.level++;
    this.layout();
    this.startMusic();
  }

  draw(ctx) {
    const { unit, time } = this.game;
    if (this.state === 'ready') this.startButton.draw(ctx);
    // 음표가 내려오는 길
    for (const d of this.drums) {
      const top = d.y - d.r * 0.35;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.roundRect(d.x - this.noteR * 1.4, this.topY - this.noteR * 1.4, this.noteR * 2.8, top - this.topY + this.noteR * 1.4, this.noteR * 1.4);
      ctx.fill();
    }
    for (const d of this.drums) {
      colorDrum(ctx, d.x, d.y + Math.sin(time * 60) * d.hit * unit * 0.006, d.r * (1 + d.hit * 0.08), d.color);
      // 치는 자리 표시(북 가죽 위, 박마다 빛남)
      ctx.strokeStyle = d.color;
      ctx.globalAlpha = 0.5 + d.glow * 0.5;
      ctx.lineWidth = unit * 0.008;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y - d.r * 0.35, d.r * (0.6 + d.glow * 0.08), d.r * (0.19 + d.glow * 0.03), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.state === 'play' || this.state === 'celebrate') this.drawNotes(ctx);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  drawNotes(ctx) {
    const travel = TRAVEL_BEATS * this.beat;
    for (const n of this.notes) {
      const d = this.drums[n.drum];
      if (!d) continue;
      const top = d.y - d.r * 0.35;
      const k = 1 - (n.time - this.t) / travel; // 0 = 맨 위, 1 = 북에 닿음
      if (k < 0) continue;
      let y = this.topY + (top - this.topY) * Math.min(k, 1);
      let alpha = Math.min(1, k * 4);
      let scale = 1;
      if (n.done === 'hit') {
        const q = (this.t - n.doneT) / 0.4;
        if (q >= 1) continue;
        alpha = 1 - q;
        scale = 1 + q * 0.8;
        y = top - q * d.r * 0.6;
      } else if (n.done === 'miss') {
        const q = (this.t - n.doneT) / 0.6;
        alpha = Math.max(0, 0.6 - q);
        y = top + q * d.r * 0.3;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      noteBall(ctx, d.x, y, this.noteR * scale, d.color);
      ctx.restore();
    }
  }
}

// 색깔 북(draw.js 의 빨간 북과 같은 모양, 색만 바꿀 수 있게)
function colorDrum(ctx, x, y, r, color) {
  ctx.save();
  const top = y - r * 0.35;
  const bottom = y + r * 0.6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, bottom, r, r * 0.32, 0, 0, Math.PI);
  ctx.lineTo(x - r, top);
  ctx.lineTo(x + r, top);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = r * 0.1;
  for (const by of [top + r * 0.22, bottom - r * 0.05]) {
    ctx.beginPath();
    ctx.ellipse(x, by, r, r * 0.32, 0, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
  }
  ctx.fillStyle = '#FFF1D6';
  ctx.strokeStyle = '#E9C893';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.ellipse(x, top, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  smile(ctx, x, y + r * 0.22, r * 0.75);
  ctx.restore();
}

// 내려오는 음표: 색 동그라미 안에 흰 음표
function noteBall(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  note(ctx, x - r * 0.2, y + r * 0.3, r * 0.75, '#fff');
}

// ---- 놀이 설명·메뉴 아이콘 ----
const loop = (t, period) => (t % period) / period;
const lerp = (a, b, k) => a + (b - a) * k;

export const guide = {
  text: '음악에 맞춰 내려오는 음표가 북에 닿을 때, 손으로 북을 콩! 쳐요.',
  demo: (ctx, s, t) => {
    const period = 1.4;
    const p = loop(t, period);
    const right = Math.floor(t / period) % 2 === 1;
    const drums = [[-s * 2.9, COLORS.red], [s * 2.9, COLORS.blue]];
    const dy = s * 2.3;
    const hitNow = p > 0.8;
    drums.forEach(([x, color], i) => {
      const active = (i === 1) === right;
      // 음표 길
      ctx.fillStyle = 'rgba(61,44,46,0.06)';
      ctx.beginPath();
      ctx.roundRect(x - s * 0.65, -s * 3.6, s * 1.3, s * 5.5, s * 0.65);
      ctx.fill();
      colorDrum(ctx, x, dy, s * (active && hitNow ? 1.25 : 1.15), color);
      if (active && !hitNow) noteBall(ctx, x, lerp(-s * 3.0, dy - s * 0.4, p / 0.8), s * 0.5, color);
      if (active && hitNow) {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          star(ctx, x + Math.cos(a) * s * 0.9, dy - s * 0.6 + Math.sin(a) * s * 0.6, s * 0.18, k % 2 ? '#fff' : COLORS.yellow);
        }
      }
    });
    // 아이가 해당 북을 번갈아 친다.
    const reach = hitNow ? 1 : Math.max(0, (p - 0.55) / 0.25);
    const kx = 0;
    const ky = s * 0.5;
    const tgt = [((right ? 1 : -1) * s * 2.2 - kx) / s, (dy - s * 0.4 - ky) / s];
    const up = right ? [1.3, -1.2] : [-1.3, -1.2];
    const moving = [lerp(up[0], tgt[0], reach), lerp(up[1], tgt[1], reach)];
    const hands = right ? [[-0.7, 0.4], moving] : [moving, [0.7, 0.4]];
    kid(ctx, kx, ky, s, { hands });
  },
};

export function menuIcon(ctx, r, t = 0) {
  const bob = Math.sin(t * 4) * r * 0.04;
  colorDrum(ctx, 0, r * 0.22, r * 0.5, COLORS.red);
  noteBall(ctx, -r * 0.3, -r * 0.45 + bob, r * 0.18, COLORS.blue);
  noteBall(ctx, r * 0.32, -r * 0.35 - bob, r * 0.15, COLORS.yellow);
}
