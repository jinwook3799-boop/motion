import { HoverButton } from '../engine/HoverButton.js';
import { balloon, monster, playIcon, star, COLORS, RAINBOW } from '../engine/draw.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { touches } from '../engine/hit.js';
import { levelSteps } from '../engine/icons.js';

const GOAL = 10; // 한 단계에서 채울 별 수
// 단계별 난이도: 별 10개를 채우면 다음 단계로, 갈수록 풍선이 빨리 올라가고 자주 나온다.
// rise: 풍선이 올라가는 속도(화면 높이 배/초) 범위, gap: 다음 풍선까지 시간(초) 범위,
// monster: 괴물이 머무는 시간(초), max: 화면에 동시에 있을 수 있는 수
const LEVELS = [
  { rise: [0.1, 0.15], gap: [0.9, 1.5], monster: 4.5, max: 5 },
  { rise: [0.13, 0.19], gap: [0.8, 1.3], monster: 4, max: 6 },
  { rise: [0.16, 0.23], gap: [0.65, 1.1], monster: 3.5, max: 6 },
  { rise: [0.2, 0.28], gap: [0.55, 0.95], monster: 3, max: 7 },
  { rise: [0.24, 0.33], gap: [0.45, 0.8], monster: 2.5, max: 8 },
];
const between = ([a, b]) => a + Math.random() * (b - a);
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
    this.level = 1;
    this.levelPulse = 0;
    this.spawnT = 0;
    this.slotPulse = new Array(GOAL).fill(0);
    speak('가운데 동그라미에 손을 올리면 시작해요!');
  }

  begin() {
    this.state = 'play';
    this.spawnT = 0.3;
    sfx.select();
    speak(this.level === 1 ? '1단계, 시작!' : '시작!');
  }

  get cfg() {
    return LEVELS[this.level - 1];
  }

  onTap(x, y) {
    if (this.state === 'ready') this.startButton.tap(x, y);
  }

  update(dt, input) {
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
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
      if (this.celebrateT <= 0) this.nextLevel();
    } else {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.items.length < this.cfg.max) {
        this.spawn();
        this.spawnT = between(this.cfg.gap);
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
        if (touches(p, it.x, it.y, it.r * 1.2 + pad)) this.popItem(it);
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
        life: this.cfg.monster,
      });
    } else {
      const baseX = z.x + r * 1.3 + Math.random() * (z.w - r * 2.6);
      this.items.push({
        kind: 'balloon',
        baseX,
        x: baseX,
        y: z.y + z.h + r,
        r,
        speed: this.game.h * between(this.cfg.rise),
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

  // 한 단계 성공: 축하하고 다음 단계로. 5단계까지 모두 하면 크게 축하하고 처음부터 다시.
  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.celebrateT = last ? 5 : 3;
    this.fireworkT = 0;
    sfx.fanfare();
    speak(last ? '5단계까지 모두 성공! 풍선 대장이에요!' : `와! ${this.level + 1}단계! 조금 더 빨라져요!`);
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    if (this.level >= LEVELS.length) {
      this.level = 1;
      this.items = [];
      this.state = 'ready';
      return;
    }
    this.level++;
    this.state = 'play';
    this.spawnT = 0.5;
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
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
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
