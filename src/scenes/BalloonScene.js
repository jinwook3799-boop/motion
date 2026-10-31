import { HoverButton } from '../engine/HoverButton.js';
import { balloon, monster, playIcon, star, COLORS, RAINBOW } from '../engine/draw.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const GOAL = 10; // 별 게이지 칸 수
const MAX_ITEMS = 6;
const MONSTER_CHANCE = 0.22;
const BALLOON_COLORS = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.blue, COLORS.pink];
const MONSTER_COLORS = [COLORS.purple, COLORS.green, COLORS.blue];

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// 모듈 1. 풍선 터뜨리기 & 괴물 물리치기
export class BalloonScene {
  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.begin(), ringColor: COLORS.green });
  }

  onResize() {
    const { w, h, unit } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
    this.radius = unit * 0.075;
  }

  enter() {
    this.state = 'ready';
    this.items = [];
    this.score = 0;
    this.spawnT = 0;
    this.slotPulse = new Array(GOAL).fill(0);
    speak('가운데 동그라미에 손을 올리면 시작해요!');
  }

  begin() {
    this.state = 'play';
    this.spawnT = 0.3;
    sfx.select();
    speak('시작!');
  }

  onTap(x, y) {
    if (this.state === 'ready') this.startButton.tap(x, y);
  }

  update(dt, input) {
    if (this.state === 'ready') {
      this.startButton.update(dt, input.pointers);
      return;
    }

    if (this.state === 'celebrate') {
      this.celebrateT -= dt;
      this.fireworkT -= dt;
      if (this.fireworkT <= 0) {
        this.fireworkT = 0.35;
        this.firework();
      }
      if (this.celebrateT <= 0) {
        this.score = 0;
        this.state = 'play';
      }
    } else {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.items.length < MAX_ITEMS) {
        this.spawn();
        this.spawnT = 0.7 + Math.random() * 0.6;
      }
    }

    for (const it of this.items) {
      it.age += dt;
      if (it.kind === 'balloon') {
        it.y -= it.speed * dt;
        it.x = it.baseX + Math.sin(it.age * it.wobbleF) * it.wobbleA;
        if (it.y < -it.r * 2.5) it.gone = true;
      } else {
        it.y = it.baseY + Math.sin(it.age * 3) * it.r * 0.2;
        if (it.age > it.life) it.gone = true;
      }
    }

    // 손 좌표와 타겟의 거리 판정. 유아용으로 판정 범위를 넉넉하게 잡는다.
    const pad = this.game.unit * 0.025;
    for (const p of input.pointers) {
      for (const it of this.items) {
        if (it.gone) continue;
        if (Math.hypot(p.x - it.x, p.y - it.y) < it.r * 1.2 + pad) this.popItem(it);
      }
    }
    this.items = this.items.filter((it) => !it.gone);

    for (let i = 0; i < GOAL; i++) this.slotPulse[i] = Math.max(0, this.slotPulse[i] - dt * 2.5);
  }

  spawn() {
    const z = this.game.zone;
    const r = this.radius * (0.9 + Math.random() * 0.25);
    if (Math.random() < MONSTER_CHANCE) {
      this.items.push({
        kind: 'monster',
        x: z.x + r * 1.3 + Math.random() * (z.w - r * 2.6),
        baseY: z.y + z.h * (0.3 + Math.random() * 0.45),
        y: 0,
        r: r * 1.1,
        color: pick(MONSTER_COLORS),
        age: 0,
        life: 4,
      });
    } else {
      const baseX = z.x + r * 1.3 + Math.random() * (z.w - r * 2.6);
      this.items.push({
        kind: 'balloon',
        baseX,
        x: baseX,
        y: z.y + z.h + r,
        r,
        speed: this.game.h * (0.12 + Math.random() * 0.08),
        color: pick(BALLOON_COLORS),
        wobbleF: 1.5 + Math.random(),
        wobbleA: r * 0.3,
        age: 0,
      });
    }
  }

  popItem(it) {
    it.gone = true;
    const { particles, unit } = this.game;
    if (it.kind === 'balloon') {
      sfx.pop();
      particles.burst(it.x, it.y, { count: 28, colors: [it.color, '#fff', COLORS.yellow], speed: unit * 0.7, size: unit * 0.02, shape: 'confetti' });
    } else {
      sfx.boing();
      particles.burst(it.x, it.y, { count: 16, colors: [COLORS.yellow, '#fff'], speed: unit * 0.6, size: unit * 0.025, shape: 'star', gravity: 200 });
    }
    particles.ring(it.x, it.y, { color: '#fff', size: it.r });
    if (this.state === 'play') this.addScore();
  }

  addScore() {
    this.slotPulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) this.celebrate();
  }

  celebrate() {
    this.state = 'celebrate';
    this.celebrateT = 3.5;
    this.fireworkT = 0;
    sfx.fanfare();
    speak('와! 참 잘했어요!');
  }

  firework() {
    const z = this.game.zone;
    const { unit } = this.game;
    this.game.particles.burst(z.x + Math.random() * z.w, z.y + Math.random() * z.h * 0.6, {
      count: 36,
      colors: RAINBOW,
      speed: unit * 0.55,
      size: unit * 0.012,
      gravity: 150,
      life: 1.2,
    });
    sfx.pop();
  }

  draw(ctx) {
    if (this.state === 'ready') {
      this.startButton.draw(ctx);
    }
    for (const it of this.items) {
      if (it.kind === 'balloon') {
        balloon(ctx, it.x, it.y, it.r, it.color);
      } else {
        const appear = Math.min(1, it.age * 4);
        const fade = Math.min(1, (it.life - it.age) * 2);
        ctx.save();
        ctx.globalAlpha = fade;
        monster(ctx, it.x, it.y, it.r * appear, it.color, it.age);
        ctx.restore();
      }
    }
    this.drawGauge(ctx);
  }

  drawGauge(ctx) {
    const { w, h, unit } = this.game;
    const s = Math.min(unit * 0.035, w / (GOAL * 3));
    const gap = s * 2.5;
    const y = h * 0.055 + s;
    const x0 = w / 2 - (gap * (GOAL - 1)) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.roundRect(x0 - s * 1.6, y - s * 1.5, gap * (GOAL - 1) + s * 3.2, s * 3, s * 1.5);
    ctx.fill();
    for (let i = 0; i < GOAL; i++) {
      const filled = i < this.score;
      star(ctx, x0 + i * gap, y, s * (1 + this.slotPulse[i] * 0.6), filled ? COLORS.yellow : 'rgba(61,44,46,0.15)', filled ? '#F4A100' : null);
    }
  }
}
