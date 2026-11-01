import { HoverButton } from '../engine/HoverButton.js';
import { playIcon, smile, star, COLORS } from '../engine/draw.js';
import { apple, levelSteps } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { touches } from '../engine/hit.js';
import { pick } from '../engine/util.js';
import { firework } from './common.js';

// ---- 판정 기준값(추정값: 실제 아이와 해 보며 조정) ----
const GOAL = 10; // 주스 컵 하나를 채우는 과일 수(= 한 단계)
const SLICE_SPEED = 0.9; // 이 빠르기(화면 짧은 변 배/초) 이상으로 손이 움직여야 '싹둑' 썰린다. 가만히 대고 있으면 안 썰림
const SPEED_WINDOW = 0.15; // 손 빠르기를 잴 때 돌아보는 시간(초). 카메라가 1초에 30장이라 몇 장을 묶어서 잰다
const HIT_SCALE = 1.15; // 과일 반지름보다 이만큼 넉넉하게 닿은 것으로 본다
const HIT_PAD = 0.025; // 판정 여유(화면 짧은 변 배)
const FRUIT_SIZE = 0.075; // 과일 반지름(화면 짧은 변 배)
const SLOW_HINT_AFTER = 0.8; // 과일에 손을 천천히 대고 있는 시간이 이만큼 쌓이면 '휙!' 하고 알려 준다(초)
const IDLE_HINT_AFTER = 9; // 이 시간(초) 동안 하나도 못 썰면 다시 알려 준다
const HINT_GAP = 10; // 안내 음성 사이 최소 간격(초)
const DROP_TIME = 0.7; // 주스 방울이 컵까지 날아가는 시간(초)
// 단계별 난이도: max = 화면에 동시에 있는 과일 수, gap = 다음 던지기까지(초), count = 한 번에 던지는 수,
// hang = 날아올랐다 떨어질 때까지 걸리는 시간(초, 길수록 느리고 둥실둥실), size = 과일 크기 배율
const LEVELS = [
  { max: 2, gap: [1.7, 2.3], count: [1, 1], hang: [4.0, 4.4], size: 1.25 },
  { max: 3, gap: [1.4, 2.0], count: [1, 2], hang: [3.7, 4.1], size: 1.15 },
  { max: 4, gap: [1.2, 1.7], count: [1, 2], hang: [3.4, 3.8], size: 1.05 },
  { max: 5, gap: [1.1, 1.5], count: [1, 3], hang: [3.1, 3.5], size: 0.97 },
  { max: 6, gap: [1.0, 1.4], count: [2, 3], hang: [2.8, 3.2], size: 0.9 },
];
const between = ([a, b]) => a + Math.random() * (b - a);
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

// 과일 그림: draw(ctx, r) 는 (0, 0) 가운데, r ≈ 과일 반지름.
// juice = 주스·튀는 즙 색, flesh = 자른 면 속살 색, rind = 자른 면 껍질 색, cut = 자른 면 크기(가로 반지름 배)
const FRUITS = {
  apple: { juice: '#FF5A5F', flesh: '#FFF1CC', rind: COLORS.red, cut: 0.85, draw: (ctx, r) => apple(ctx, 0, r * 0.14, r * 0.85) },
  watermelon: { juice: '#FF4D6D', flesh: '#FF6B81', rind: '#3BB273', cut: 0.95, draw: watermelon },
  banana: { juice: '#FFE066', flesh: '#FFF6C9', rind: COLORS.yellow, cut: 0.3, draw: banana },
  strawberry: { juice: '#FF3D6B', flesh: '#FFC2CF', rind: '#FF4F6D', cut: 0.8, draw: strawberry },
  orange: { juice: '#FFA62B', flesh: '#FFC56B', rind: COLORS.orange, cut: 0.88, draw: orangeFruit },
  grapes: { juice: COLORS.purple, flesh: '#D9F7B0', rind: COLORS.purple, cut: 0.75, draw: grapes },
};
const FRUIT_KEYS = Object.keys(FRUITS);

// 과일 썰기: 둥실 날아오르는 과일을 손을 휙 휘둘러 싹둑! 썬 과일 즙은 주스 컵으로 쏙.
// 컵이 가득 차면(과일 10개) "맛있는 주스 완성!" 하고 다음 단계. 폭탄·감점 없음, 놓친 과일은 그냥 떨어진다.
export class SliceScene {
  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.begin(), ringColor: COLORS.green });
    this.history = new Map(); // 포인터 key → 최근 위치 기록 [{ t, x, y }] (손 빠르기·방향 계산용)
  }

  onResize() {
    const { w, h, unit, zone: z } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
    this.radius = unit * FRUIT_SIZE;
    // 주스 컵: 오른쪽(왼쪽 아래 집 버튼과 먼 곳). (x, y) = 컵 바닥 가운데
    const cw = unit * 0.13;
    const ch = unit * 0.19;
    this.cup = { x: z.x + z.w - cw * 0.8, y: z.y + z.h * 0.58, w: cw, h: ch };
  }

  enter() {
    this.state = 'ready';
    this.fruits = [];
    this.halves = [];
    this.drops = [];
    this.slashes = [];
    this.bands = []; // 컵에 채워진 주스 색(아래부터)
    this.sliced = 0; // 이번 컵을 위해 썬 과일 수(날아가는 방울 포함)
    this.level = 1;
    this.levelPulse = 0;
    this.cupPulse = 0;
    this.cupPop = 1;
    this.spawnT = 0;
    this.sinceSlice = 0;
    this.slowT = 0;
    this.lastHint = -Infinity;
    this.history.clear();
    speak('가운데 동그라미에 손을 올리면 시작해요!');
  }

  begin() {
    this.state = 'play';
    this.spawnT = 0.4;
    this.sinceSlice = 0;
    this.lastHint = this.game.time;
    sfx.select();
    speak(this.level === 1 ? '1단계! 손을 휙 휘둘러서 과일을 싹둑 썰어요!' : '시작!');
  }

  get cfg() {
    return LEVELS[this.level - 1];
  }

  // 터치·클릭: 과일을 바로 썬다(보호자·PC 테스트용).
  onTap(x, y) {
    if (this.state === 'ready') return this.startButton.tap(x, y);
    const f = this.fruits.find((f) => !f.gone && Math.hypot(f.x - x, f.y - y) < f.r * 1.3);
    if (f) this.slice(f, Math.PI * (0.15 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1));
  }

  // 포인터마다 최근 위치를 기록해 둔다. 화면은 1초에 60번 그리지만 카메라는 30장 정도라
  // 한 프레임 이동 거리만 보면 손이 멈춘 것처럼 보이는 프레임이 생기므로, 조금 긴 시간으로 잰다.
  trackPointers(pointers) {
    const now = this.game.time;
    const seen = new Set();
    for (const p of pointers) {
      seen.add(p.key);
      let list = this.history.get(p.key);
      if (!list) this.history.set(p.key, (list = []));
      list.push({ t: now, x: p.x, y: p.y });
      while (list.length > 2 && now - list[1].t > SPEED_WINDOW) list.shift();
    }
    for (const [key, list] of this.history) if (!seen.has(key) && now - list[list.length - 1].t > 0.5) this.history.delete(key);
  }

  // 손의 빠르기(화면 짧은 변 배/초)와 방향, 그리고 '지나간 길'(최근 기록 처음 → 지금)
  motionOf(p) {
    const list = this.history.get(p.key);
    const now = this.game.time;
    const old = list?.[0];
    const seg = { x: p.x, y: p.y, px: p.px, py: p.py };
    if (!old || now - old.t < 0.04) return { speed: 0, angle: 0, seg };
    const dx = p.x - old.x;
    const dy = p.y - old.y;
    const speed = Math.hypot(dx, dy) / (now - old.t) / this.game.unit;
    // 지난 프레임 위치(px, py)보다 조금 더 긴 길로 판정해 빠른 손짓이 과일을 건너뛰지 않게 한다.
    return { speed, angle: Math.atan2(dy, dx), seg: { x: p.x, y: p.y, px: old.x, py: old.y } };
  }

  update(dt, input) {
    const { unit, zone: z } = this.game;
    this.trackPointers(input.pointers);
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    this.cupPulse = Math.max(0, this.cupPulse - dt * 2);
    this.cupPop = Math.max(0, this.cupPop - dt * 2.5);
    this.updateEffects(dt);
    if (this.state === 'ready') {
      this.startButton.update(dt, input.pointers);
      return;
    }

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.4;
        firework(this.game);
      }
      if (this.stateT <= 0) this.nextLevel();
    } else {
      this.sinceSlice += dt;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.sliced < GOAL) {
        const room = this.cfg.max - this.fruits.length;
        const n = Math.min(room, randInt(this.cfg.count));
        for (let i = 0; i < n; i++) this.toss(i, n);
        this.spawnT = between(this.cfg.gap);
      }
      if (this.sinceSlice > IDLE_HINT_AFTER && this.fruits.length) this.hint();
    }

    for (const f of this.fruits) {
      f.vy += f.g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.age += dt;
      f.rot = Math.sin(f.age * f.swayF + f.phase) * f.swayA;
      f.wiggle = Math.max(0, f.wiggle - dt * 3);
      if (f.vy > 0 && f.y > z.y + z.h + f.r * 2) f.gone = true; // 놓친 과일은 조용히 떨어져 사라진다
    }

    // 썰기: 손이 충분히 빠르게 과일을 지나가야 한다. 천천히 대기만 하면 과일이 살짝 흔들리고 안내만 한다.
    const pad = unit * HIT_PAD;
    let slow = false;
    for (const p of input.pointers) {
      const m = this.motionOf(p);
      for (const f of this.fruits) {
        if (f.gone || !touches(m.seg, f.x, f.y, f.r * HIT_SCALE + pad)) continue;
        if (m.speed >= SLICE_SPEED) this.slice(f, m.angle);
        else {
          slow = true;
          f.wiggle = 1;
        }
      }
    }
    this.slowT = slow ? this.slowT + dt : Math.max(0, this.slowT - dt * 0.3);
    if (this.slowT > SLOW_HINT_AFTER) this.hint();
    this.fruits = this.fruits.filter((f) => !f.gone);
    this.whooshed = false;
  }

  hint() {
    const now = this.game.time;
    if (now - this.lastHint < HINT_GAP) return;
    this.lastHint = now;
    this.slowT = 0;
    this.sinceSlice = 0;
    speak('손을 휙! 빠르게 휘두르면 싹둑 썰려요!');
  }

  // 과일 던지기: 아래에서 둥실 날아올라 꼭대기에서 잠깐 머물다 다시 떨어진다.
  toss(i, n) {
    const { zone: z } = this.game;
    const cfg = this.cfg;
    const r = this.radius * cfg.size * (0.92 + Math.random() * 0.16);
    // 왼쪽 가운데 집 버튼과 오른쪽 주스 컵은 피해서 던진다(떨어지는 쪽도 왼쪽 끝까지 가지 않게). 여러 개면 칸을 나눠 겹치지 않게.
    const lo = 0.2;
    const hi = 0.74;
    const slot = (hi - lo) / n;
    const x0 = z.x + z.w * (lo + slot * (i + 0.15 + Math.random() * 0.7));
    // 꼭대기를 지나 반대쪽으로 같은 만큼 더 가므로, 떨어지는 곳(2 × 꼭대기 − 출발)이 왼쪽 16% 안으로 들어가지 않게
    const minApex = Math.max(0.18, (x0 - z.x) / z.w / 2 + 0.08);
    const apexX = Math.max(z.x + z.w * minApex, Math.min(z.x + z.w * 0.72, x0 + (Math.random() - 0.5) * z.w * 0.3));
    const apexY = z.y + z.h * (0.15 + Math.random() * 0.25);
    const y0 = z.y + z.h + r * 1.2;
    const T = between(cfg.hang) / 2; // 꼭대기까지 걸리는 시간
    const H = y0 - apexY;
    this.fruits.push({
      kind: pick(FRUIT_KEYS),
      x: x0,
      y: y0,
      vx: (apexX - x0) / T,
      vy: (-2 * H) / T,
      g: (2 * H) / (T * T),
      r,
      rot: 0,
      age: 0,
      // 얼굴이 뒤집히지 않게 빙글빙글 대신 살랑살랑 흔들린다.
      swayA: 0.15 + Math.random() * 0.15,
      swayF: 1.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      wiggle: 0,
    });
  }

  slice(f, angle) {
    f.gone = true;
    const { particles, unit } = this.game;
    const fruit = FRUITS[f.kind];
    if (!this.whooshed) sfx.whoosh(); // 한 번에 여러 개를 썰어도 '휙' 소리는 한 번
    this.whooshed = true;
    sfx.pop();
    // 썬 방향으로 두 조각이 갈라져 날아간다.
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const push = unit * 0.35;
    for (const side of [-1, 1]) {
      this.halves.push({
        kind: f.kind,
        x: f.x + nx * side * f.r * 0.08,
        y: f.y + ny * side * f.r * 0.08,
        vx: f.vx * 0.4 + nx * side * push + Math.cos(angle) * unit * 0.1,
        vy: Math.min(f.vy * 0.4, 0) + ny * side * push - unit * 0.15,
        g: unit * 1.6,
        r: f.r,
        rot0: f.rot,
        cut: angle,
        side,
        spin: side * (1.5 + Math.random() * 1.5),
        turn: 0,
        age: 0,
      });
    }
    this.slashes.push({ x: f.x, y: f.y, angle, len: f.r * 3, age: 0 });
    particles.burst(f.x, f.y, { count: 22, colors: [fruit.juice, fruit.flesh, '#fff'], speed: unit * 0.6, size: unit * 0.016, gravity: 700, life: 0.8 });
    particles.burst(f.x, f.y, { count: 6, colors: [COLORS.yellow, '#fff'], speed: unit * 0.4, size: unit * 0.02, shape: 'star', gravity: 200 });
    particles.ring(f.x, f.y, { color: fruit.juice, size: f.r });
    this.sinceSlice = 0;
    this.slowT = 0;
    if (this.state !== 'play' || this.sliced >= GOAL) return;
    // 즙 한 방울이 주스 컵으로 쏙
    this.sliced++;
    this.drops.push({ x0: f.x, y0: f.y, color: fruit.juice, t: 0 });
  }

  updateEffects(dt) {
    const { h } = this.game;
    for (const p of this.halves) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.turn += p.spin * dt;
    }
    this.halves = this.halves.filter((p) => p.y < h + p.r * 2 && p.age < 3);
    for (const s of this.slashes) s.age += dt;
    this.slashes = this.slashes.filter((s) => s.age < 0.35);
    for (const d of this.drops) {
      d.t += dt / DROP_TIME;
      if (d.t >= 1 && !d.done) {
        d.done = true;
        this.fillCup(d.color);
      }
    }
    this.drops = this.drops.filter((d) => !d.done);
  }

  fillCup(color) {
    const { particles, unit } = this.game;
    const c = this.cup;
    this.bands.push(color);
    this.cupPulse = 1;
    sfx.bloop();
    const top = c.y - c.h * 0.08 - (c.h * 0.82 * this.bands.length) / GOAL;
    particles.burst(c.x, top, { count: 8, colors: [color, '#fff'], speed: unit * 0.25, size: unit * 0.012, gravity: 500, life: 0.5 });
    if (this.bands.length >= GOAL && this.state === 'play') this.celebrate();
  }

  // 컵 가득: "맛있는 주스 완성!" 하고 다음 단계. 5단계까지 하면 크게 축하하고 처음부터.
  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0.2;
    sfx.fanfare();
    const { particles, unit } = this.game;
    const c = this.cup;
    particles.burst(c.x, c.y - c.h, { count: 24, colors: [COLORS.yellow, COLORS.pink, '#fff'], speed: unit * 0.5, size: unit * 0.025, shape: 'star', gravity: 200 });
    speak(last ? '맛있는 주스 완성! 5단계까지 모두 성공! 과일 요리사예요!' : `맛있는 주스 완성! 이번엔 ${this.level + 1}단계!`);
  }

  nextLevel() {
    this.bands = [];
    this.sliced = 0;
    this.cupPop = 1;
    this.levelPulse = 1;
    sfx.sparkle();
    if (this.level >= LEVELS.length) {
      this.level = 1;
      this.fruits = [];
      this.state = 'ready';
      return;
    }
    this.level++;
    this.state = 'play';
    this.spawnT = 0.6;
    this.sinceSlice = 0;
  }

  draw(ctx) {
    const { time } = this.game;
    const c = this.cup;
    const full = this.state === 'celebrate';
    const k = (1 - this.cupPop) ** 0.5 * (1 + this.cupPulse * 0.08 + (full ? Math.abs(Math.sin(time * 6)) * 0.08 : 0));
    juiceCup(ctx, c.x, c.y, c.w * k, c.h * k, this.bands, time, { full, slosh: this.cupPulse });
    if (this.state === 'ready') this.startButton.draw(ctx);
    for (const f of this.fruits) {
      const wig = Math.sin(time * 30) * f.wiggle * 0.15;
      drawFruit(ctx, f.kind, f.x, f.y, f.r, f.rot + wig);
    }
    for (const p of this.halves) drawHalf(ctx, p);
    for (const s of this.slashes) drawSlash(ctx, s);
    for (const d of this.drops) this.drawDrop(ctx, d);
    this.drawBlades(ctx);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  // 날아가는 주스 방울: 위로 볼록한 길을 따라 컵 위로
  drawDrop(ctx, d) {
    const c = this.cup;
    const t = Math.min(1, d.t);
    const x1 = c.x;
    const y1 = c.y - c.h * 1.05;
    const cx = (d.x0 + x1) / 2;
    const cy = Math.min(d.y0, y1) - this.game.unit * 0.25;
    const u = 1 - t;
    const x = u * u * d.x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * d.y0 + 2 * u * t * cy + t * t * y1;
    juiceDrop(ctx, x, y, this.game.unit * 0.022, d.color);
  }

  // 마법 칼: 손이 썰 수 있을 만큼 빠르게 움직이는 동안 손끝을 따라 하얗게 빛나는 줄
  drawBlades(ctx) {
    const { unit, time } = this.game;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [key, list] of this.history) {
      if (!(key.endsWith('-tip') || key === 'mouse') || list.length < 2) continue;
      const last = list[list.length - 1];
      if (time - last.t > 0.05) continue;
      const first = list[0];
      const speed = Math.hypot(last.x - first.x, last.y - first.y) / Math.max(1e-3, last.t - first.t) / unit;
      if (speed < SLICE_SPEED) continue;
      const a = Math.min(1, (speed - SLICE_SPEED) / SLICE_SPEED + 0.4);
      for (const [width, color] of [
        [unit * 0.03, `rgba(180,230,255,${0.35 * a})`],
        [unit * 0.012, `rgba(255,255,255,${0.95 * a})`],
      ]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        list.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---- 그림 ----

function drawFruit(ctx, kind, x, y, r, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  FRUITS[kind].draw(ctx, r);
  ctx.restore();
}

// 썬 반쪽: 자른 선(cut 방향)의 한쪽만 보이게 자르고, 자른 면에 속살을 그린다.
function drawHalf(ctx, p) {
  const fruit = FRUITS[p.kind];
  const r = p.r;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (3 - p.age) * 2);
  ctx.translate(p.x, p.y);
  ctx.rotate(p.turn + p.cut);
  ctx.beginPath();
  ctx.rect(-r * 3, p.side > 0 ? 0 : -r * 3, r * 6, r * 3);
  ctx.clip();
  ctx.save();
  ctx.rotate(p.rot0 - p.cut);
  fruit.draw(ctx, r);
  ctx.restore();
  // 자른 면: 껍질 테두리 + 속살
  const cw = r * fruit.cut;
  ctx.fillStyle = fruit.rind;
  ctx.beginPath();
  ctx.ellipse(0, 0, cw, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fruit.flesh;
  ctx.beginPath();
  ctx.ellipse(0, 0, cw * 0.85, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 썬 자리에 번쩍하는 하얀 칼자국
function drawSlash(ctx, s) {
  const k = s.age / 0.35;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  ctx.globalAlpha = 1 - k;
  const L = s.len * (0.6 + k * 0.5);
  const w = s.len * 0.07 * (1 - k * 0.5);
  ctx.fillStyle = 'rgba(190,235,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(0, 0, L / 2, w * 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-L / 2, 0);
  ctx.quadraticCurveTo(0, -w, L / 2, 0);
  ctx.quadraticCurveTo(0, w, -L / 2, 0);
  ctx.fill();
  ctx.restore();
}

function juiceDrop(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.6);
  ctx.bezierCurveTo(s * 0.6, -s * 0.7, s, -s * 0.2, s, s * 0.2);
  ctx.arc(0, s * 0.2, s, 0, Math.PI);
  ctx.bezierCurveTo(-s, -s * 0.2, -s * 0.6, -s * 0.7, 0, -s * 1.6);
  ctx.fill();
  ctx.lineWidth = s * 0.25;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.35, s * 0.05, s * 0.18, s * 0.3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 주스 컵: (x, y) = 컵 바닥 가운데. bands = 아래부터 채워진 주스 색들(GOAL 개면 가득)
function juiceCup(ctx, x, y, w, h, bands, t, { full = false, slosh = 0, goal = GOAL } = {}) {
  if (w <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  const top = w / 2;
  const bot = w * 0.37;
  const glass = () => {
    ctx.beginPath();
    ctx.moveTo(-top, -h);
    ctx.lineTo(-bot, -w * 0.1);
    ctx.quadraticCurveTo(-bot * 0.95, 0, -bot * 0.75, 0);
    ctx.lineTo(bot * 0.75, 0);
    ctx.quadraticCurveTo(bot * 0.95, 0, bot, -w * 0.1);
    ctx.lineTo(top, -h);
    ctx.closePath();
  };
  // 빨대(가득 찼을 때)
  if (full) {
    ctx.save();
    ctx.translate(w * 0.12, -h * 0.5);
    ctx.rotate(0.35);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w * 0.06, -h * 0.85, w * 0.12, h * 0.9);
    ctx.fillStyle = COLORS.pink;
    for (let i = 0; i < 5; i++) ctx.fillRect(-w * 0.06, -h * 0.85 + i * h * 0.18, w * 0.12, h * 0.08);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.02, w * 0.45, w * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  glass();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  // 주스 층: 위층부터 그려야 아래층이 덮어 출렁이는 경계가 보인다.
  ctx.save();
  glass();
  ctx.clip();
  const inner = h * 0.82;
  const base = h * 0.08;
  const bh = inner / goal;
  for (let i = bands.length - 1; i >= 0; i--) {
    const yTop = -base - bh * (i + 1);
    const amp = h * (0.012 + (i === bands.length - 1 ? slosh * 0.035 : 0));
    ctx.fillStyle = bands[i];
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    for (let k = 0; k <= 12; k++) {
      const px = -w / 2 + (w * k) / 12;
      ctx.lineTo(px, yTop + Math.sin(k * 1.1 + t * 4 + i) * amp);
    }
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
  }
  if (bands.length) {
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(-w, -base, w * 2, base);
  }
  // 유리 반짝임
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.28, -h * 0.55, w * 0.05, h * 0.3, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  glass();
  ctx.lineJoin = 'round';
  ctx.lineWidth = w * 0.07;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.lineWidth = w * 0.025;
  ctx.strokeStyle = 'rgba(61,44,46,0.35)';
  ctx.stroke();
  // 컵 얼굴(가득 차면 더 활짝)
  smile(ctx, 0, -h * 0.42, w * (full ? 0.55 : 0.45));
  // 가득 찼을 때 컵 가장자리에 오렌지 조각
  if (full) {
    ctx.save();
    ctx.translate(-top * 0.75, -h);
    ctx.fillStyle = COLORS.orange;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFC56B';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFE8B0';
    ctx.lineWidth = w * 0.02;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * w * 0.15, Math.sin(a) * w * 0.15);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + (i * Math.PI * 2) / 3;
      star(ctx, Math.cos(a) * w * 0.75, -h * 0.55 + Math.sin(a) * h * 0.45, w * 0.1, COLORS.yellow, '#fff');
    }
  }
  ctx.restore();
}

function shine(ctx, x, y, rx, ry, a = -0.4) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
  ctx.fill();
}

function watermelon(ctx, r) {
  ctx.save();
  ctx.fillStyle = '#3BB273';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();
  // 줄무늬
  ctx.strokeStyle = '#1F7A4A';
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.42, -r);
    for (let k = 1; k <= 6; k++) ctx.lineTo(i * r * 0.42 * (1 - Math.abs(k - 3) * 0.08) + (k % 2 ? 1 : -1) * r * 0.07, -r + (k * r) / 3);
    ctx.stroke();
  }
  ctx.restore();
  shine(ctx, -r * 0.5, -r * 0.45, r * 0.13, r * 0.25);
  ctx.fillStyle = '#A8E6BE';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.1, r * 0.58, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, 0, r * 0.08, r * 0.9);
}

function banana(ctx, r) {
  ctx.save();
  ctx.translate(0, -r * 0.15);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#E8B400';
  ctx.lineWidth = r * 0.62;
  ctx.beginPath();
  ctx.arc(0, -r * 0.9, r * 1.3, Math.PI * 0.22, Math.PI * 0.78);
  ctx.stroke();
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = r * 0.5;
  ctx.stroke();
  // 꼭지
  ctx.fillStyle = '#7A4E2D';
  const a1 = Math.PI * 0.22;
  const a2 = Math.PI * 0.78;
  ctx.beginPath();
  ctx.arc(Math.cos(a2) * r * 1.3, -r * 0.9 + Math.sin(a2) * r * 1.3, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(Math.cos(a1) * r * 1.3, -r * 0.9 + Math.sin(a1) * r * 1.3);
  ctx.rotate(-0.9);
  ctx.fillRect(-r * 0.07, -r * 0.28, r * 0.14, r * 0.3);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(0, -r * 0.9, r * 1.45, Math.PI * 0.35, Math.PI * 0.55);
  ctx.stroke();
  smile(ctx, 0, r * 0.38, r * 0.62);
  ctx.restore();
}

function strawberry(ctx, r) {
  ctx.fillStyle = '#FF4F6D';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.98);
  ctx.bezierCurveTo(-r * 0.6, r * 0.72, -r * 1.0, r * 0.05, -r * 0.88, -r * 0.42);
  ctx.bezierCurveTo(-r * 0.72, -r * 0.85, r * 0.72, -r * 0.85, r * 0.88, -r * 0.42);
  ctx.bezierCurveTo(r * 1.0, r * 0.05, r * 0.6, r * 0.72, 0, r * 0.98);
  ctx.fill();
  // 씨
  ctx.fillStyle = '#FFE48A';
  for (const [sx, sy] of [[-0.55, -0.3], [0.55, -0.3], [-0.62, 0.2], [0.62, 0.2], [-0.3, 0.6], [0.3, 0.6], [0, 0.78], [-0.25, -0.5], [0.25, -0.5]]) {
    ctx.beginPath();
    ctx.ellipse(sx * r, sy * r, r * 0.04, r * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  shine(ctx, -r * 0.55, -r * 0.05, r * 0.1, r * 0.2, 0.3);
  // 꼭지 잎
  ctx.fillStyle = '#3BB273';
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r * 0.3, -r * 0.62 + Math.sin(a) * r * 0.12, r * 0.28, r * 0.1, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2A8F5A';
  ctx.fillRect(-r * 0.05, -r * 0.95, r * 0.1, r * 0.3);
  smile(ctx, 0, r * 0.05, r * 0.8);
}

function orangeFruit(ctx, r) {
  const R = r * 0.92;
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.arc(0, r * 0.06, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,200,120,0.6)';
  for (const [dx, dy] of [[-0.5, 0.45], [0.55, 0.4], [0.2, 0.75], [-0.2, -0.5], [0.6, -0.25]]) {
    ctx.beginPath();
    ctx.arc(dx * r, dy * r, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  shine(ctx, -r * 0.5, -r * 0.35, r * 0.12, r * 0.24);
  ctx.fillStyle = '#7A4E2D';
  ctx.beginPath();
  ctx.arc(0, -R + r * 0.08, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3BB273';
  ctx.beginPath();
  ctx.ellipse(r * 0.25, -R - r * 0.02, r * 0.26, r * 0.11, -0.4, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, 0, r * 0.15, r * 0.85);
}

function grapes(ctx, r) {
  ctx.strokeStyle = '#7A4E2D';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.lineTo(r * 0.08, -r * 1.0);
  ctx.stroke();
  ctx.fillStyle = '#3BB273';
  ctx.beginPath();
  ctx.ellipse(r * 0.35, -r * 0.88, r * 0.28, r * 0.13, -0.3, 0, Math.PI * 2);
  ctx.fill();
  const rr = r * 0.31;
  const berries = [[-0.55, -0.42], [0, -0.45], [0.55, -0.42], [-0.6, 0.08], [0, 0.05], [0.6, 0.08], [-0.3, 0.52], [0.3, 0.52], [0, 0.88]];
  for (const [bx, by] of berries) {
    ctx.fillStyle = COLORS.purple;
    ctx.beginPath();
    ctx.arc(bx * r, by * r, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7B3FC4';
    ctx.lineWidth = r * 0.04;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(bx * r - rr * 0.35, by * r - rr * 0.35, rr * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  smile(ctx, 0, -r * 0.12, r * 0.8);
}

// ---- 놀이 설명·메뉴 아이콘 ----
const loop = (t, period) => (t % period) / period;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const GUIDE_FRUITS = ['watermelon', 'apple', 'orange', 'strawberry', 'grapes', 'banana'];

function demoCursor(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
  star(ctx, x, y, s * 0.27, COLORS.yellow, '#fff');
}

export const guide = {
  text: '과일이 날아오르면 손을 휙! 휘둘러서 싹둑 썰어요. 주스 컵을 가득 채워 봐요!',
  demo: (ctx, s, t) => {
    const P = 3;
    const p = loop(t, P);
    const round = Math.floor(t / P);
    const kind = GUIDE_FRUITS[round % GUIDE_FRUITS.length];
    const fx = s * 0.6;
    const fy = -s * 1.2;
    const kx = -s * 1.6;
    const ky = s * 0.9;
    const CUT = 0.5;
    // 손: 위에서 아래로 비스듬히 휙
    const start = [1.0, -3.0];
    const end = [3.4, -0.6];
    let hk = 0;
    if (p >= 0.4 && p < 0.6) hk = ease((p - 0.4) / 0.2);
    else if (p >= 0.6 && p < 0.85) hk = 1;
    else if (p >= 0.85) hk = 1 - ease((p - 0.85) / 0.15);
    const hand = [lerp(start[0], end[0], hk), lerp(start[1], end[1], hk)];
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    // 주스 컵(오른쪽)
    const filled = (round % 5) * 2 + (p > 0.85 ? 2 : p > 0.7 ? 1 : 0);
    const bands = Array.from({ length: Math.min(10, filled) }, (_, i) => FRUITS[GUIDE_FRUITS[i % GUIDE_FRUITS.length]].juice);
    juiceCup(ctx, s * 5.0, s * 2.9, s * 2.0, s * 3.0, bands, t, { slosh: p > 0.7 && p < 0.95 ? 1 : 0 });
    if (p < CUT) {
      // 아래에서 둥실 날아오른다.
      const k = Math.min(1, p / 0.42);
      const y = lerp(s * 5, fy, 1 - (1 - k) ** 2);
      drawFruit(ctx, kind, fx, y, s * 0.95, Math.sin(t * 2) * 0.2);
    } else {
      // 두 조각으로 갈라져 떨어진다 + 즙 방울이 컵으로
      const q = (p - CUT) / (1 - CUT);
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      for (const side of [-1, 1]) {
        drawHalf(ctx, {
          kind,
          x: fx + nx * side * q * s * 1.2,
          y: fy + ny * side * q * s * 1.2 + q * q * s * 4,
          r: s * 0.95,
          rot0: 0,
          cut: angle,
          side,
          turn: side * q * 1.5,
          age: Math.max(0, q * 3.5 - 0.5),
        });
      }
      if (q < 0.3) drawSlash(ctx, { x: fx, y: fy, angle, len: s * 2.4, age: (q / 0.3) * 0.35 });
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + 0.3;
        const d = s * (0.4 + q * 1.6);
        ctx.fillStyle = i % 2 ? FRUITS[kind].juice : '#fff';
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * d, fy + Math.sin(a) * d + q * q * s, s * 0.12 * (1 - q), 0, Math.PI * 2);
        ctx.fill();
      }
      if (q < 0.45) {
        const k = q / 0.45;
        const x1 = s * 5.0;
        const y1 = -s * 0.3;
        const cx = (fx + x1) / 2;
        const cy = fy - s * 1.5;
        const u = 1 - k;
        juiceDrop(ctx, u * u * fx + 2 * u * k * cx + k * k * x1, u * u * fy + 2 * u * k * cy + k * k * y1, s * 0.2, FRUITS[kind].juice);
      }
    }
    // 휘두르는 동안 하얀 마법 칼 줄
    if (p >= 0.42 && p < 0.62) {
      const k0 = Math.max(0, hk - 0.35);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(180,230,255,0.5)';
      ctx.lineWidth = s * 0.3;
      ctx.beginPath();
      ctx.moveTo(kx + lerp(start[0], end[0], k0) * s, ky + lerp(start[1], end[1], k0) * s);
      ctx.lineTo(kx + hand[0] * s, ky + hand[1] * s);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s * 0.12;
      ctx.stroke();
      ctx.restore();
    }
    kid(ctx, kx, ky, s, { hands: [[-0.7, 0.4], hand] });
    demoCursor(ctx, kx + hand[0] * s, ky + hand[1] * s, s);
  },
};

export function menuIcon(ctx, r, t = 0) {
  const angle = -0.7;
  const gap = 0.16 + Math.abs(Math.sin(t * 2)) * 0.06;
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  for (const side of [-1, 1]) {
    drawHalf(ctx, {
      kind: 'watermelon',
      x: nx * side * r * gap - r * 0.05,
      y: ny * side * r * gap + r * 0.05,
      r: r * 0.55,
      rot0: 0,
      cut: angle,
      side,
      turn: side * 0.12,
      age: 0,
    });
  }
  drawSlash(ctx, { x: -r * 0.05, y: r * 0.05, angle, len: r * 1.5, age: 0.2 });
  juiceDrop(ctx, r * 0.55, -r * 0.5, r * 0.09, '#FF4D6D');
  juiceDrop(ctx, -r * 0.55, r * 0.55, r * 0.07, '#FF4D6D');
}
