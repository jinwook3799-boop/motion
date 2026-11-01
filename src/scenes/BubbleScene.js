import { HoverButton } from '../engine/HoverButton.js';
import { playIcon, COLORS } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { touches } from '../engine/hit.js';
import { pick, shuffle } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 10; // 한 단계에서 채울 별 수
const CHANGE_EVERY = 4; // 별을 이만큼 모을 때마다 찾을 색이 바뀐다
const TARGET_SHARE = 0.4; // 새로 나오는 방울 중 찾는 색의 비율
const REMIND_GAP = 7; // 다른 색을 터치했을 때 색을 다시 알려 주는 최소 간격(초)
const HINT_AFTER = 8; // 이 시간(초) 동안 맞는 방울을 못 터뜨리면 맞는 방울을 반짝여 준다
const BOUNCE_COOL = 0.6; // 다른 색 방울을 같은 손으로 연달아 '뿅' 하지 않게 하는 시간(초)
// 방울 색. similar = 헷갈리기 쉬운 비슷한 색(4단계부터 섞어 낸다)
const PALETTE = {
  red: { name: '빨간', color: COLORS.red, similar: ['pink', 'orange'] },
  blue: { name: '파란', color: COLORS.blue, similar: ['purple', 'green'] },
  yellow: { name: '노란', color: COLORS.yellow, similar: ['orange', 'green'] },
  green: { name: '초록', color: COLORS.green, similar: ['blue', 'yellow'] },
  purple: { name: '보라', color: COLORS.purple, similar: ['blue', 'pink'] },
  pink: { name: '분홍', color: COLORS.pink, similar: ['red', 'purple'] },
  orange: { name: '주황', color: COLORS.orange, similar: ['red', 'yellow'] },
};
// 단계별 난이도: colors = 찾는 색 후보(앞에서부터 쓰는 색 수), count = 화면에 쓰는 색 수,
// rise = 떠오르는 속도(화면 높이 배/초) 범위, gap = 다음 방울까지(초), max = 동시에 있는 방울 수,
// size = 방울 크기 배율, similar = 비슷한 색을 섞어 내는지
const LEVELS = [
  { colors: ['red', 'blue', 'yellow'], count: 3, rise: [0.06, 0.08], gap: [0.8, 1.2], max: 6, size: 1.15, similar: false },
  { colors: ['red', 'blue', 'yellow'], count: 3, rise: [0.07, 0.1], gap: [0.7, 1.0], max: 7, size: 1.05, similar: false },
  { colors: ['red', 'blue', 'yellow', 'green'], count: 4, rise: [0.08, 0.12], gap: [0.6, 0.9], max: 8, size: 1.0, similar: false },
  { colors: ['red', 'blue', 'yellow', 'green', 'purple'], count: 4, rise: [0.1, 0.14], gap: [0.5, 0.8], max: 9, size: 0.95, similar: true },
  { colors: ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange'], count: 5, rise: [0.12, 0.17], gap: [0.45, 0.7], max: 10, size: 0.9, similar: true },
];
const between = ([a, b]) => a + Math.random() * (b - a);

// 비눗방울 색깔 고르기: 말해 준 색깔 방울만 손으로 터뜨린다. 다른 색은 '뿅' 튕겨 나갈 뿐 감점이 없다.
export class BubbleScene {
  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.begin(), ringColor: COLORS.green });
  }

  onResize() {
    const { w, h, unit, zone: z } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
    this.radius = unit * 0.07;
    // 찾는 색 표시(오른쪽 위, 집 버튼과 먼 곳)
    this.cue = { x: z.x + z.w - unit * 0.1, y: z.y + unit * 0.1, r: unit * 0.075 };
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'ready';
    this.bubbles = [];
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.cuePulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.target = null;
    this.lastRemind = -Infinity;
    this.sinceHit = 0;
    this.bounceAt = new Map(); // 포인터 key → 마지막으로 다른 색을 튕긴 시각
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
    sfx.select();
    this.chooseTarget();
    this.announce(this.level === 1 ? '1단계! ' : '');
  }

  // 찾을 색을 바꾸고, 그 색과 함께 나올 색들을 정한다.
  chooseTarget() {
    const cfg = this.cfg;
    const prev = this.target;
    this.target = pick(cfg.colors.filter((c) => c !== prev));
    let others = shuffle(cfg.colors.filter((c) => c !== this.target));
    if (cfg.similar) {
      // 비슷한 색을 앞에 두어 꼭 섞여 나오게 한다.
      const sim = PALETTE[this.target].similar;
      others = [...sim, ...others.filter((c) => !sim.includes(c))];
    }
    this.mix = [this.target, ...others.slice(0, cfg.count - 1)];
    this.cuePulse = 1;
    this.sinceHit = 0;
  }

  announce(prefix = '') {
    this.lastRemind = this.game.time;
    sfx.bloop();
    speak(`${prefix}${PALETTE[this.target].name} 방울만 터뜨려요!`);
  }

  onTap(x, y) {
    if (this.state === 'ready') return this.startButton.tap(x, y);
    const b = this.bubbles.find((b) => !b.gone && Math.hypot(b.x - x, b.y - y) < b.r * 1.3);
    if (b) this.touchBubble(b, { x, y, key: 'tap' });
  }

  update(dt, input) {
    const { unit, zone: z, time } = this.game;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    this.cuePulse = Math.max(0, this.cuePulse - dt * 1.2);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
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
    } else if (this.state === 'play') {
      this.sinceHit += dt;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.bubbles.length < this.cfg.max) {
        this.spawn();
        this.spawnT = between(this.cfg.gap);
      }
      if (this.sinceHit > HINT_AFTER && time - this.lastRemind > REMIND_GAP) this.announce();
    }

    for (const b of this.bubbles) {
      b.age += dt;
      // 떠오르며 살랑살랑. 튕겨 나간 힘(vx)은 점점 줄어든다.
      b.vx *= Math.pow(0.25, dt);
      b.x += (b.vx + Math.cos(b.age * b.wobbleF) * b.wobbleA) * dt;
      b.y -= b.speed * dt;
      if (b.x < z.x + b.r) b.vx = Math.abs(b.vx);
      if (b.x > z.x + z.w - b.r) b.vx = -Math.abs(b.vx);
      b.x = Math.max(z.x + b.r * 0.5, Math.min(z.x + z.w - b.r * 0.5, b.x));
      if (b.y < z.y - b.r * 1.5) b.gone = true;
    }

    // 유아용으로 판정을 넉넉하게
    const pad = unit * 0.025;
    for (const p of input.pointers) {
      for (const b of this.bubbles) {
        if (!b.gone && touches(p, b.x, b.y, b.r * 1.15 + pad)) this.touchBubble(b, p);
      }
    }
    this.bubbles = this.bubbles.filter((b) => !b.gone);
  }

  spawn() {
    const { zone: z, h } = this.game;
    const cfg = this.cfg;
    const r = this.radius * cfg.size * (0.85 + Math.random() * 0.3);
    // 찾는 색이 화면에 하나도 없으면 꼭 찾는 색을 낸다.
    const hasTarget = this.bubbles.some((b) => b.key === this.target);
    const key = !hasTarget || Math.random() < TARGET_SHARE ? this.target : pick(this.mix.slice(1));
    // 왼쪽 아래 집 버튼 위로는 올라오지 않게 왼쪽 끝은 조금 비운다.
    const x = z.x + z.w * 0.14 + r + Math.random() * (z.w * 0.86 - r * 2);
    this.bubbles.push({
      key,
      x,
      y: z.y + z.h + r,
      r,
      vx: 0,
      speed: h * between(cfg.rise),
      wobbleF: 1 + Math.random() * 1.2,
      wobbleA: r * (0.5 + Math.random() * 0.6),
      age: 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  touchBubble(b, p) {
    if (this.state === 'celebrate') return this.pop(b, false);
    if (this.state !== 'play') return;
    if (b.key === this.target) return this.pop(b, true);
    // 다른 색: 혼내지 않고 '뿅' 튕겨 나간다.
    const now = this.game.time;
    if (now - (this.bounceAt.get(p.key) ?? -Infinity) < BOUNCE_COOL || now - (b.bounced ?? -Infinity) < BOUNCE_COOL) return;
    this.bounceAt.set(p.key, now);
    b.bounced = now;
    const dir = b.x >= p.x ? 1 : -1;
    b.vx = dir * this.game.unit * (1.2 + Math.random() * 0.4);
    b.squish = now;
    sfx.boing();
    if (now - this.lastRemind > REMIND_GAP) this.announce();
  }

  pop(b, good) {
    b.gone = true;
    const { particles, unit } = this.game;
    const color = PALETTE[b.key].color;
    sfx.pop();
    particles.burst(b.x, b.y, { count: 22, colors: [color, '#fff', '#CFF4FF'], speed: unit * 0.6, size: unit * 0.014, gravity: 250 });
    particles.ring(b.x, b.y, { color, size: b.r });
    if (!good) return;
    particles.burst(b.x, b.y, { count: 8, colors: [COLORS.yellow, '#fff'], speed: unit * 0.45, size: unit * 0.022, shape: 'star', gravity: 150 });
    this.sinceHit = 0;
    this.pulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) return this.celebrate();
    if (this.score % CHANGE_EVERY === 0) {
      // 찾는 색 바꾸기: 잠깐 뒤에 알려 준다.
      this.chooseTarget();
      sfx.sparkle();
      this.after(new Promise((r) => setTimeout(r, 500)), () => this.announce('이번에는 '));
    }
  }

  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.2;
    this.fireT = 0;
    sfx.fanfare();
    this.after(speak(last ? '5단계까지 모두 성공! 방울 대장이에요!' : `와! ${this.level + 1}단계! 방울이 더 많아져요!`), () => {});
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    if (this.level >= LEVELS.length) {
      this.level = 1;
      this.bubbles = [];
      this.state = 'ready';
      return;
    }
    this.level++;
    this.state = 'play';
    this.spawnT = 0.4;
    this.chooseTarget();
    this.announce();
  }

  draw(ctx) {
    const { time } = this.game;
    if (this.state === 'ready') this.startButton.draw(ctx);
    // 오래 못 찾으면 찾는 색 방울이 반짝반짝
    const hint = this.state === 'play' && this.sinceHit > HINT_AFTER;
    for (const b of this.bubbles) {
      const sq = b.squish ? Math.max(0, 1 - (time - b.squish) * 3) : 0;
      const glow = hint && b.key === this.target ? 0.5 + 0.5 * Math.sin(time * 8) : 0;
      soapBubble(ctx, b.x, b.y, b.r, PALETTE[b.key].color, time + b.phase, sq, glow);
    }
    if (this.state !== 'ready' && this.target) this.drawCue(ctx);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  // 찾는 색: 큰 방울 + 손가락 '콕' 표시
  drawCue(ctx) {
    const { time } = this.game;
    const { x, y, r } = this.cue;
    const k = 1 + this.cuePulse * 0.5 + Math.sin(time * 3) * 0.04;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = r * 0.1;
    ctx.strokeStyle = PALETTE[this.target].color;
    ctx.stroke();
    soapBubble(ctx, x, y, r * k, PALETTE[this.target].color, time, 0, 0, true);
    ctx.restore();
  }
}

// 비눗방울: 반투명한 색 + 무지갯빛 테두리 + 반짝이는 하이라이트.
// squish(0~1) = 튕길 때 찌그러짐, glow(0~1) = 힌트 반짝임, solid = 색을 더 진하게(찾는 색 표시용)
function soapBubble(ctx, x, y, r, color, t, squish = 0, glow = 0, solid = false) {
  ctx.save();
  ctx.translate(x, y);
  const wob = Math.sin(t * 2.3) * 0.03 + squish * 0.18;
  ctx.scale(1 + wob, 1 - wob);
  if (glow > 0) {
    ctx.fillStyle = `rgba(255,236,140,${0.35 + glow * 0.4})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.35 + glow * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.55, withAlpha(color, solid ? 0.55 : 0.4));
  g.addColorStop(1, withAlpha(color, solid ? 0.95 : 0.85));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = color;
  ctx.stroke();
  // 무지갯빛 얇은 테두리
  ctx.lineWidth = r * 0.04;
  ctx.strokeStyle = `hsla(${(t * 60) % 360}, 90%, 75%, 0.7)`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, Math.PI * 0.1, Math.PI * 0.6);
  ctx.stroke();
  // 하이라이트
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.38, r * 0.4, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- 놀이 설명·메뉴 아이콘 ----
const loop = (t, period) => (t % period) / period;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a, b, k) => a + (b - a) * k;

export const guide = {
  text: '위에 보이는 색깔 방울만 손으로 톡! 터뜨려요. 다른 색은 뿅 하고 도망가요.',
  demo: (ctx, s, t) => {
    const p = loop(t, 3);
    // 오른쪽 위: 찾는 색(빨강)
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.arc(s * 5.3, -s * 3.2, s * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    soapBubble(ctx, s * 5.3, -s * 3.2, s * 0.55, COLORS.red, t, 0, 0, true);
    // 떠다니는 방울: 파랑·노랑은 그냥 두고 빨강을 터뜨린다.
    soapBubble(ctx, -s * 3.4, -s * 1.6 + Math.sin(t * 2) * s * 0.15, s * 0.6, COLORS.blue, t);
    soapBubble(ctx, s * 3.4, s * 0.5 + Math.sin(t * 2 + 1) * s * 0.15, s * 0.6, COLORS.yellow, t + 2);
    const k = p < 0.45 ? ease(p / 0.45) : p < 0.75 ? 1 : ease(1 - (p - 0.75) / 0.25);
    const hit = p >= 0.45 && p < 0.75;
    const bx = s * 1.5;
    const by = -s * 1.5;
    if (!hit) soapBubble(ctx, bx, by, s * 0.65, COLORS.red, t + 1);
    else {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const d = s * (0.5 + (p - 0.45) * 2.5);
        ctx.fillStyle = i % 2 ? COLORS.red : COLORS.yellow;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const kx = -s * 0.5;
    const ky = s * 0.7;
    const to = [(bx - kx) / s - 0.2, (by - ky) / s + 0.25];
    kid(ctx, kx, ky, s, { hands: [[-0.7, 0.4], [lerp(0.7, to[0], k), lerp(0.4, to[1], k)]] });
  },
};

export function menuIcon(ctx, r, t = 0) {
  soapBubble(ctx, -r * 0.2, r * 0.12, r * 0.42, COLORS.blue, t);
  soapBubble(ctx, r * 0.35, -r * 0.28, r * 0.26, COLORS.pink, t + 1);
  soapBubble(ctx, r * 0.4, r * 0.38, r * 0.16, COLORS.yellow, t + 2);
}
