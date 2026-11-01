import { HoverButton } from '../engine/HoverButton.js';
import { playIcon, COLORS } from '../engine/draw.js';
import { fish, levelSteps, starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 10; // 한 단계에서 잡을 물고기 수
// 두 손바닥이 이 거리(화면 짧은 변 배) 안으로 모이면 '그물'이 된다(한 아이의 두 손이든, 두 아이의 손이든)
const NET_DIST = 0.2;
const NET_PAD = 0.07; // 그물 둘레에 더해 주는 여유(화면 짧은 변 배) — 유아용으로 넉넉하게
// 두 손이 이 거리 안이면 '모으는 중'으로 보고 물고기를 놀래지 않는다(점선으로 이어 보여 줌)
const GATHER_DIST = 0.42;
const SCARE_DIST = 0.09; // 한 손이 이만큼 가까이 오면 물고기가 쌩 도망간다
const SCARE_COOL = 1.2; // 같은 물고기가 다시 도망가기까지(초)
const HINT_AFTER = 10; // 이 시간(초) 동안 못 잡으면 두 손을 모으라고 알려 준다
// 단계별 난이도: speed = 헤엄 속도(놀이 영역 너비 배/초) 범위, gap = 다음 물고기까지(초) 범위, max = 동시에 있는 수
const LEVELS = [
  { speed: [0.06, 0.08], gap: [1.6, 2.4], max: 3 },
  { speed: [0.07, 0.1], gap: [1.4, 2.1], max: 3 },
  { speed: [0.09, 0.12], gap: [1.2, 1.8], max: 4 },
  { speed: [0.11, 0.14], gap: [1.0, 1.6], max: 4 },
  { speed: [0.13, 0.17], gap: [0.9, 1.4], max: 5 },
];
const FISH_COLORS = [COLORS.orange, COLORS.yellow, COLORS.pink, COLORS.red, COLORS.purple, COLORS.green];
const between = ([a, b]) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 물고기 잡기: 두 손을 모아 그물을 만들어 물고기를 잡는다(양손 협응). 한 손만 다가가면 물고기가 쌩 도망간다.
export class FishScene {
  hideCursor = true; // 손가락 끝 대신 손바닥(잡는 데 쓰는 곳)을 직접 그린다

  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.begin(), ringColor: COLORS.green });
  }

  onResize() {
    const { w, h, unit } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
    this.fishS = unit * 0.05;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'ready';
    this.fishes = [];
    this.caught = []; // 잡혀서 위로 올라가는 물고기(그림용)
    this.nets = [];
    this.links = [];
    this.palms = [];
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.sinceCatch = 0;
    this.hinted = false;
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

  begin() {
    this.state = 'play';
    this.spawnT = 0.3;
    this.sinceCatch = 0;
    sfx.select();
    speak(this.level === 1 ? '두 손을 모아서 물고기를 잡아요!' : '시작!');
  }

  onTap(x, y) {
    if (this.state === 'ready') return this.startButton.tap(x, y);
    const f = this.fishes.find((f) => Math.hypot(f.x - x, f.y - y) < this.fishS * 2);
    if (f) this.catchFish(f);
  }

  update(dt, input) {
    const { unit, zone: z } = this.game;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.findNets(input.hands);
    if (this.state === 'ready') {
      this.startButton.update(dt, input.pointers);
      return;
    }

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) this.nextLevel();
    } else {
      this.sinceCatch += dt;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.fishes.length < this.cfg.max) {
        this.spawn();
        this.spawnT = between(this.cfg.gap);
      }
      if (this.sinceCatch > HINT_AFTER && !this.hinted) {
        this.hinted = true;
        this.after(speak(this.palms.length < 2 ? '두 손을 모두 보여 주세요!' : '두 손을 꼭 모아서 물고기를 감싸요!'), () => {});
      }
    }

    const now = this.game.time;
    for (const f of this.fishes) {
      f.age += dt;
      f.dart = Math.max(0, f.dart - dt * 1.5);
      const sp = f.speed * (1 + f.dart * 4);
      f.x += f.dir * sp * dt;
      f.y = f.baseY + Math.sin(f.age * f.bobF) * f.bobA + f.dy;
      f.dy *= Math.pow(0.4, dt);
      if ((f.dir > 0 && f.x > z.x + z.w + this.fishS * 2) || (f.dir < 0 && f.x < z.x - this.fishS * 2)) f.gone = true;
    }

    if (this.state === 'play') {
      for (const net of this.nets) {
        for (const f of this.fishes) {
          if (!f.gone && dist(f, net) < net.r + unit * NET_PAD * 0.5) this.catchFish(f);
        }
      }
      // 그물이 아닌 외톨이 손: 물고기가 장난스럽게 쌩 도망간다.
      for (const p of this.palms) {
        if (p.inNet || p.gathering) continue;
        for (const f of this.fishes) {
          if (f.gone || now - f.scaredAt < SCARE_COOL || dist(f, p) > unit * SCARE_DIST + this.fishS) continue;
          f.scaredAt = now;
          f.dart = 1;
          f.dir = f.x >= p.x ? 1 : -1;
          f.dy += (f.y >= p.y ? 1 : -1) * unit * 0.05;
          sfx.whoosh();
          this.game.particles.burst(f.x, f.y, { count: 6, colors: ['#fff', '#CFF4FF'], speed: unit * 0.25, size: unit * 0.012, gravity: -200, life: 0.7 });
        }
      }
    }
    this.fishes = this.fishes.filter((f) => !f.gone);

    for (const c of this.caught) c.t += dt;
    this.caught = this.caught.filter((c) => c.t < 0.9);
  }

  // 손바닥끼리 짝을 지어 그물을 찾는다. 가까운 쌍부터, 손 하나는 그물 하나에만 쓴다.
  findNets(hands) {
    const { unit } = this.game;
    this.palms = hands.filter((h) => this.game.inZone(h.palm)).map((h) => ({ x: h.palm.x, y: h.palm.y, id: h.id, inNet: false, gathering: false }));
    const pairs = [];
    for (let i = 0; i < this.palms.length; i++)
      for (let j = i + 1; j < this.palms.length; j++) pairs.push({ a: this.palms[i], b: this.palms[j], d: dist(this.palms[i], this.palms[j]) });
    pairs.sort((p, q) => p.d - q.d);
    this.nets = [];
    this.links = [];
    const used = new Set();
    for (const { a, b, d } of pairs) {
      if (used.has(a) || used.has(b) || d > unit * GATHER_DIST) continue;
      used.add(a);
      used.add(b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (d < unit * NET_DIST) {
        a.inNet = b.inNet = true;
        this.nets.push({ ...mid, r: Math.max(d / 2, unit * 0.06) + unit * NET_PAD * 0.5, a, b });
      } else {
        a.gathering = b.gathering = true;
        this.links.push({ a, b, k: (unit * GATHER_DIST - d) / (unit * (GATHER_DIST - NET_DIST)) });
      }
    }
  }

  spawn() {
    const { zone: z, unit } = this.game;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const s = this.fishS * (0.9 + Math.random() * 0.3);
    this.fishes.push({
      x: dir > 0 ? z.x - s * 2 : z.x + z.w + s * 2,
      baseY: z.y + z.h * (0.3 + Math.random() * 0.48),
      y: 0,
      dy: 0,
      dir,
      s,
      speed: z.w * between(this.cfg.speed),
      color: pick(FISH_COLORS),
      bobF: 1.5 + Math.random(),
      bobA: unit * 0.02,
      age: Math.random() * 5,
      dart: 0,
      scaredAt: -Infinity,
    });
  }

  catchFish(f) {
    f.gone = true;
    const { particles, unit } = this.game;
    sfx.bloop();
    sfx.success();
    particles.burst(f.x, f.y, { count: 18, colors: ['#fff', '#CFF4FF', '#7BDFF2'], speed: unit * 0.5, size: unit * 0.016, gravity: -150 });
    particles.burst(f.x, f.y, { count: 10, colors: [COLORS.yellow, '#fff'], speed: unit * 0.55, size: unit * 0.022, shape: 'star', gravity: 150 });
    particles.ring(f.x, f.y, { color: '#fff', size: unit * 0.08 });
    this.caught.push({ x: f.x, y: f.y, s: f.s, dir: f.dir, color: f.color, t: 0 });
    if (this.state !== 'play') return;
    this.sinceCatch = 0;
    this.hinted = false;
    this.pulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) this.celebrate();
  }

  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.2;
    this.fireT = 0;
    sfx.fanfare();
    this.after(speak(last ? '물고기를 모두 잡았어요! 최고의 어부예요!' : `와! ${this.level + 1}단계! 물고기가 더 빨라져요!`), () => {});
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    if (this.level >= LEVELS.length) {
      this.level = 1;
      this.fishes = [];
      this.state = 'ready';
      return;
    }
    this.level++;
    this.state = 'play';
    this.sinceCatch = 0;
    this.spawnT = 0.5;
  }

  draw(ctx) {
    const { unit, time } = this.game;
    this.drawSea(ctx);
    if (this.state === 'ready') this.startButton.draw(ctx);
    for (const f of this.fishes) swimFish(ctx, f.x, f.y, f.s, f.color, f.dir, time + f.age);
    // 잡힌 물고기: 방울에 싸여 위로 퐁
    for (const c of this.caught) {
      const k = c.t / 0.9;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      const y = c.y - k * unit * 0.25;
      swimFish(ctx, c.x, y, c.s * (1 + k * 0.3), c.color, c.dir, time);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = unit * 0.006;
      ctx.beginPath();
      ctx.arc(c.x, y, c.s * 1.6 * (1 + k * 0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const l of this.links) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + l.k * 0.5})`;
      ctx.lineWidth = unit * 0.008;
      ctx.setLineDash([unit * 0.02, unit * 0.02]);
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
      ctx.restore();
    }
    for (const n of this.nets) drawNet(ctx, n.x, n.y, n.r, time);
    for (const p of this.palms) palmMark(ctx, p.x, p.y, unit * 0.04, p.inNet);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  // 바다: 파란 물 + 위쪽 물결 + 아래 미역·모래
  drawSea(ctx) {
    const { w, h, unit, time, zone: z } = this.game;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(76,201,240,0.28)');
    g.addColorStop(1, 'rgba(30,96,180,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const wy = z.y + unit * 0.02;
    for (let x = 0; x <= w; x += unit * 0.04) ctx.lineTo(x, wy + Math.sin(x / (unit * 0.08) + time * 2) * unit * 0.012);
    ctx.lineTo(w, 0);
    ctx.fill();
    // 모래
    ctx.fillStyle = 'rgba(255,214,140,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += unit * 0.05) ctx.lineTo(x, z.y + z.h - unit * 0.01 + Math.sin(x / (unit * 0.2)) * unit * 0.015);
    ctx.lineTo(w, h);
    ctx.fill();
    // 미역(오른쪽 아래, 집 버튼과 떨어진 곳)
    ctx.lineCap = 'round';
    ctx.lineWidth = unit * 0.014;
    for (let i = 0; i < 5; i++) {
      const bx = z.x + z.w * (0.3 + i * 0.16);
      ctx.strokeStyle = i % 2 ? 'rgba(59,206,172,0.7)' : 'rgba(46,160,120,0.7)';
      ctx.beginPath();
      ctx.moveTo(bx, z.y + z.h);
      for (let k = 1; k <= 6; k++) ctx.lineTo(bx + Math.sin(time * 1.5 + k * 0.9 + i) * unit * 0.015, z.y + z.h - k * unit * 0.025);
      ctx.stroke();
    }
    // 떠오르는 공기 방울
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = unit * 0.004;
    for (let i = 0; i < 10; i++) {
      const k = (time * 0.12 + i * 0.37) % 1;
      const x = z.x + z.w * ((i * 0.618) % 1) + Math.sin(time * 2 + i) * unit * 0.01;
      ctx.beginPath();
      ctx.arc(x, z.y + z.h - k * z.h, unit * (0.006 + (i % 3) * 0.004), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// 헤엄치는 물고기(dir: 1 = 오른쪽으로). icons.js 물고기는 왼쪽을 보고 있어 오른쪽으로 갈 때 뒤집는다.
function swimFish(ctx, x, y, s, color, dir, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir > 0 ? -1 : 1, 1);
  ctx.rotate(Math.sin(t * 6) * 0.06);
  fish(ctx, 0, 0, s, color);
  ctx.restore();
}

// 그물: 두 손 사이에 생기는 동그란 그물(테두리 + 격자)
function drawNet(ctx, x, y, r, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = r * 0.035;
  const step = r * 0.35;
  for (let d = -r * 2; d <= r * 2; d += step) {
    ctx.beginPath();
    ctx.moveTo(d - r, -r);
    ctx.lineTo(d + r, r);
    ctx.moveTo(d + r, -r);
    ctx.lineTo(d - r, r);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = COLORS.orange;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + Math.sin(t * 6) * 0.03), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 손바닥 표시: 그물이 되면 주황색으로
function palmMark(ctx, x, y, r, inNet) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = inNet ? COLORS.orange : '#FFD6A5';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.15;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---- 놀이 설명·메뉴 아이콘 ----
const loop = (t, period) => (t % period) / period;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a, b, k) => a + (b - a) * k;

export const guide = {
  text: '두 손을 모아 그물을 만들어서 물고기를 쏙 잡아요! 한 손으로는 물고기가 도망가요.',
  demo: (ctx, s, t) => {
    ctx.fillStyle = 'rgba(76,201,240,0.18)';
    ctx.fillRect(-s * 9, -s * 6, s * 18, s * 12);
    const p = loop(t, 3.2);
    const nx = s * 0.6; // 그물(두 손이 모이는 곳)
    const ny = -s * 1.0;
    // 물고기가 오른쪽에서 헤엄쳐 와서 두 손 사이로
    const fx = lerp(s * 6.5, nx, Math.min(1, p / 0.55));
    const k = ease(Math.max(0, Math.min(1, (p - 0.3) / 0.25))); // 두 손 모으기
    const caught = p > 0.55;
    const kx = -s * 1.2;
    const ky = s * 1.0;
    const cx = (nx - kx) / s;
    const cy = (ny - ky) / s;
    const left = [lerp(-1.0, cx - 0.75, k), lerp(0.1, cy, k)];
    const right = [lerp(1.4, cx + 0.75, k), lerp(-0.5, cy, k)];
    if (!caught) swimFish(ctx, fx, ny, s * 0.7, COLORS.orange, -1, t);
    else {
      const q = (p - 0.55) / 0.45;
      drawNet(ctx, nx, ny, s * 1.0, t);
      swimFish(ctx, nx, ny - q * s * 0.3, s * 0.7, COLORS.orange, -1, t);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.fillStyle = i % 2 ? '#fff' : COLORS.yellow;
        ctx.beginPath();
        ctx.arc(nx + Math.cos(a) * s * (1.4 + q), ny + Math.sin(a) * s * (1.4 + q), s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    kid(ctx, kx, ky, s, { hands: [left, right] });
  },
};

export function menuIcon(ctx, r, t = 0) {
  ctx.fillStyle = 'rgba(76,201,240,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  swimFish(ctx, 0, 0, r * 0.3, COLORS.orange, 1, t);
  ctx.strokeStyle = COLORS.orange;
  ctx.lineWidth = r * 0.07;
  ctx.setLineDash([r * 0.1, r * 0.07]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const side of [-1, 1]) palmMark(ctx, side * r * 0.62, r * 0.12, r * 0.13, true);
}
