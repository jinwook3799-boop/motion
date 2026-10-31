import { balloon, star, COLORS } from '../engine/draw.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework } from './common.js';

const GOAL = 8; // 팀마다 모을 별
const MAX_PER_SIDE = 3;
const TEAMS = [
  { name: '파란 풍선', color: COLORS.blue },
  { name: '빨간 풍선', color: COLORS.red },
];

// 색깔 팀 풍선: 왼쪽 아이는 파란 풍선, 오른쪽 아이는 빨간 풍선을 터뜨려 둘 다 별을 채운다.
export class TeamBalloonScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  // 아바타 색 = 서 있는 쪽 팀 색
  avatarColorOf(person) {
    return TEAMS[this.sideOf(person.center.x)].color;
  }

  sideOf(x) {
    const z = this.game.zone;
    return x < z.x + z.w / 2 ? 0 : 1;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.reset();
    this.after(speak('준비, 시작!'), () => {});
  }

  reset() {
    this.items = [];
    this.teams = TEAMS.map(() => ({ score: 0, pulse: new Array(GOAL).fill(0), spawnT: 0.5 + Math.random(), done: false }));
    this.state = 'play';
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

  get r() {
    return this.game.unit * 0.07;
  }

  spawn(side) {
    const { zone: z, h } = this.game;
    const r = this.r * (0.9 + Math.random() * 0.25);
    const half = z.w / 2;
    const baseX = z.x + side * half + r * 1.4 + Math.random() * (half - r * 2.8);
    this.items.push({ side, baseX, x: baseX, y: z.y + z.h + r, r, speed: h * (0.11 + Math.random() * 0.07), wobbleF: 1.5 + Math.random(), age: 0 });
  }

  onTap(x, y) {
    const it = this.items.find((b) => Math.hypot(x - b.x, y - b.y) < b.r * 1.3);
    if (it) this.pop(it);
  }

  update(dt, input) {
    for (const t of this.teams) for (let i = 0; i < GOAL; i++) t.pulse[i] = Math.max(0, t.pulse[i] - dt * 2.5);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) this.reset();
      return;
    }

    this.teams.forEach((t, side) => {
      if (t.done) return;
      t.spawnT -= dt;
      if (t.spawnT <= 0 && this.items.filter((b) => b.side === side).length < MAX_PER_SIDE) {
        this.spawn(side);
        t.spawnT = 0.9 + Math.random() * 0.7;
      }
    });

    for (const b of this.items) {
      b.age += dt;
      b.y -= b.speed * dt;
      b.x = b.baseX + Math.sin(b.age * b.wobbleF) * b.r * 0.3;
      if (b.y < -b.r * 2.5) b.gone = true;
    }

    const pad = this.game.unit * 0.025;
    for (const p of input.pointers) {
      for (const b of this.items) {
        if (!b.gone && Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.2 + pad) this.pop(b);
      }
    }
    this.items = this.items.filter((b) => !b.gone);
  }

  pop(b) {
    b.gone = true;
    const team = this.teams[b.side];
    const { particles, unit } = this.game;
    sfx.pop();
    particles.burst(b.x, b.y, { count: 24, colors: [TEAMS[b.side].color, '#fff', COLORS.yellow], speed: unit * 0.7, size: unit * 0.02, shape: 'confetti' });
    if (team.done) return;
    team.pulse[team.score] = 1;
    team.score++;
    if (team.score < GOAL) return;

    team.done = true;
    sfx.success();
    if (this.teams.every((t) => t.done)) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('둘 다 해냈어요! 최고의 팀이에요!'), () => {});
    } else {
      const other = TEAMS[1 - b.side].name;
      this.after(speak(`${TEAMS[b.side].name} 다 모았어요! ${other}도 힘내요!`), () => {});
    }
  }

  draw(ctx) {
    const { zone: z, unit } = this.game;
    // 가운데 경계선과 양쪽 색 배경
    TEAMS.forEach((t, side) => {
      ctx.fillStyle = side === 0 ? 'rgba(58,134,255,0.08)' : 'rgba(255,90,95,0.08)';
      ctx.fillRect(z.x + (side * z.w) / 2, z.y, z.w / 2, z.h);
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = unit * 0.01;
    ctx.setLineDash([unit * 0.03, unit * 0.025]);
    ctx.beginPath();
    ctx.moveTo(z.x + z.w / 2, z.y);
    ctx.lineTo(z.x + z.w / 2, z.y + z.h);
    ctx.stroke();
    ctx.restore();

    for (const b of this.items) balloon(ctx, b.x, b.y, b.r, TEAMS[b.side].color);
    this.teams.forEach((t, side) => this.drawGauge(ctx, t, side));
  }

  // 팀마다 자기 쪽 위에 별 게이지
  drawGauge(ctx, team, side) {
    const { zone: z, w, unit } = this.game;
    const s = Math.min(unit * 0.025, w / (GOAL * 7));
    const gap = s * 2.4;
    const cx = z.x + z.w * (side === 0 ? 0.3 : 0.72);
    const y = z.y - s * 0.4;
    const x0 = cx - (gap * (GOAL - 1)) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.roundRect(x0 - s * 1.5, y - s * 1.5, gap * (GOAL - 1) + s * 3, s * 3, s * 1.5);
    ctx.fill();
    for (let i = 0; i < GOAL; i++) {
      const filled = i < team.score;
      star(ctx, x0 + i * gap, y, s * (1 + team.pulse[i] * 0.6), filled ? TEAMS[side].color : 'rgba(61,44,46,0.15)', filled ? '#fff' : null);
    }
  }
}
