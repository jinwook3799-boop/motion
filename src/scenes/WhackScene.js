import { HoverButton } from '../engine/HoverButton.js';
import { playIcon, COLORS, RAINBOW } from '../engine/draw.js';
import { mole } from '../engine/animals.js';
import { hammer, starGauge } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const GOAL = 10;
const COLS = 3;
const ROWS = 2;
const RISE = 0.18; // 올라오는 시간(초)
const SINK = 0.25; // 내려가는 시간(초)
const DIZZY = 0.6; // 맞고 어지러워하는 시간(초)
// 두더지가 나와 있는 시간(초): 처음엔 느긋하게, 잡을수록 조금씩 짧아진다
const STAY_START = 2.0;
const STAY_MIN = 1.2;

// 두더지 잡기
export class WhackScene {
  hideCursor = true;

  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.begin(), ringColor: COLORS.green });
    this.holes = [];
  }

  onResize() {
    const { w, h, unit, zone: z } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
    this.r = Math.min(z.w / (COLS * 2.8), z.h / (ROWS * 2.7));
    this.holes = Array.from({ length: COLS * ROWS }, (_, i) => ({
      x: z.x + (z.w * ((i % COLS) + 0.5)) / COLS,
      y: z.y + z.h * (0.45 + Math.floor(i / COLS) * 0.4),
      mole: this.holes[i]?.mole ?? null,
    }));
  }

  enter() {
    this.state = 'ready';
    this.score = 0;
    this.t = 0;
    this.lastHit = -1;
    this.hammers = [];
    this.slotPulse = new Array(GOAL).fill(0);
    for (const hole of this.holes) hole.mole = null;
    speak('가운데 동그라미에 손을 올리면 시작해요!');
  }

  begin() {
    this.state = 'play';
    this.spawnT = 0.6;
    sfx.select();
    speak('시작!');
  }

  onTap(x, y) {
    if (this.state === 'ready') this.startButton.tap(x, y);
  }

  // 두더지 몸 중심 y (up: 0=구멍 속, 1=다 나옴)
  moleY(hole, up) {
    return hole.y + this.r * 0.5 - up * this.r * 1.2;
  }

  upAmount(m) {
    if (m.state === 'rise') return Math.min(1, m.t / RISE);
    if (m.state === 'sink') return Math.max(0, 1 - m.t / SINK);
    return 1;
  }

  update(dt, input) {
    this.t += dt;
    for (let i = 0; i < GOAL; i++) this.slotPulse[i] = Math.max(0, this.slotPulse[i] - dt * 2.5);
    this.hammers = input.hands.map((hand) => hand.palm);
    const mouse = input.pointers.find((p) => p.key === 'mouse');
    if (mouse) this.hammers.push(mouse);

    if (this.state === 'ready') {
      this.startButton.update(dt, input.pointers);
      return;
    }

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) this.firework();
      if (this.stateT <= 0) {
        this.score = 0;
        this.state = 'play';
      }
    } else {
      this.spawnT -= dt;
      const active = this.holes.filter((h) => h.mole).length;
      if (this.spawnT <= 0 && active < (this.score >= 5 ? 2 : 1)) this.spawn(input.pointers);
    }

    for (const hole of this.holes) {
      const m = hole.mole;
      if (!m) continue;
      m.t += dt;
      if (m.state === 'rise' && m.t >= RISE) Object.assign(m, { state: 'up', t: 0 });
      else if (m.state === 'up' && m.t >= m.stay) Object.assign(m, { state: 'sink', t: 0 });
      else if (m.state === 'hit' && m.t >= DIZZY) Object.assign(m, { state: 'sink', t: 0 });
      else if (m.state === 'sink' && m.t >= SINK) hole.mole = null;
    }

    // 손이 두더지에 닿으면 잡힌다(판정 범위는 넉넉하게).
    const pad = this.game.unit * 0.02;
    for (const hole of this.holes) {
      const m = hole.mole;
      if (!m || !(m.state === 'up' || (m.state === 'rise' && m.t > 0.08))) continue;
      const my = this.moleY(hole, this.upAmount(m));
      const reach = this.r * 0.75 * 1.1 + pad;
      if (input.pointers.some((p) => Math.hypot(p.x - hole.x, p.y - my) < reach)) this.hit(hole, my);
    }
  }

  spawn(pointers) {
    // 손이 올라가 있는 구멍에서는 나오지 않는다(손을 대고 기다리기만 해서 잡히지 않게).
    const free = this.holes.filter((h) => !h.mole && !pointers.some((p) => Math.hypot(p.x - h.x, p.y - h.y) < this.r * 1.4));
    if (!free.length) return;
    const hole = free[(Math.random() * free.length) | 0];
    const stay = Math.max(STAY_MIN, STAY_START - this.score * 0.08);
    hole.mole = { state: 'rise', t: 0, stay };
    this.spawnT = 0.4 + Math.random() * 0.5;
    sfx.peek();
  }

  hit(hole, my) {
    Object.assign(hole.mole, { state: 'hit', t: 0 });
    this.lastHit = this.t;
    sfx.bonk();
    const { particles, unit } = this.game;
    particles.burst(hole.x, my, { count: 18, colors: [COLORS.yellow, '#fff', COLORS.orange], speed: unit * 0.6, size: unit * 0.022, shape: 'star', gravity: 300 });
    particles.ring(hole.x, my, { color: '#fff', size: this.r * 0.7 });
    if (this.state !== 'play') return;
    this.slotPulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      speak('두더지 잡기 대장! 최고예요!');
    }
  }

  firework() {
    this.fireT = 0.35;
    const { zone: z, unit } = this.game;
    this.game.particles.burst(z.x + Math.random() * z.w, z.y + Math.random() * z.h * 0.5, { count: 36, colors: RAINBOW, speed: unit * 0.55, size: unit * 0.012, gravity: 150, life: 1.2 });
    sfx.pop();
  }

  draw(ctx) {
    const r = this.r;
    for (const hole of this.holes) {
      const { x, y } = hole;
      ctx.fillStyle = '#5A3E2B';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();

      const m = hole.mole;
      if (m) {
        // 구멍 위쪽과 구멍 안에서만 보이게 잘라 그려서 땅속에서 나오는 것처럼 보이게 한다.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - r * 1.3, y - r * 3, r * 2.6, r * 3);
        ctx.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2);
        ctx.clip();
        mole(ctx, x, this.moleY(hole, this.upAmount(m)), r * 0.75, m.state === 'hit', this.t);
        ctx.restore();
      }

      ctx.strokeStyle = '#8B5E3C';
      ctx.lineWidth = r * 0.16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.1, r * 0.38, 0, 0.05, Math.PI - 0.05);
      ctx.stroke();
    }

    if (this.state === 'ready') this.startButton.draw(ctx);

    const swing = Math.max(0, 1 - (this.t - this.lastHit) / 0.2);
    for (const p of this.hammers) hammer(ctx, p.x, p.y, this.game.unit * 0.07, swing);

    starGauge(ctx, this.game, GOAL, this.score, this.slotPulse);
  }
}
