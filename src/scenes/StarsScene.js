import { star, COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 10;
const HINT_AFTER = 9; // 이 시간(초) 안에 못 잡으면 어떻게 잡는지 알려 준다
// 별이 뜨는 자리(놀이 영역 비율). up = 손을 위로 쭉, side = 옆으로 가서 잡기
const SPOTS = [
  { u: 0.24, v: 0.08, kind: 'up' },
  { u: 0.5, v: 0.1, kind: 'up' },
  { u: 0.76, v: 0.08, kind: 'up' },
  { u: 0.04, v: 0.45, kind: 'side' },
  { u: 0.96, v: 0.45, kind: 'side' },
  { u: 0.05, v: 0.72, kind: 'side' },
  { u: 0.95, v: 0.72, kind: 'side' },
];

// 하늘 별 따기: 화면 위·옆 끝의 별을 손을 뻗거나 옆으로 가서 잡는다.
export class StarsScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.blue;

  constructor(game) {
    this.game = game;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.star = null;
    this.state = 'intro';
    this.after(speak('하늘에 별이 떴어요! 손을 쭉 뻗어서 별을 잡아 봐요!'), () => this.spawn());
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

  // 다음 별은 방금 잡은 곳에서 먼 자리에 띄워 몸을 계속 움직이게 한다.
  spawn() {
    const last = this.star?.spot;
    const spot = pick(SPOTS.filter((s) => !last || (s !== last && (Math.abs(s.u - last.u) > 0.35 || s.kind !== last.kind))));
    this.star = { spot, age: 0 };
    this.state = 'reach';
    this.hinted = false;
    sfx.peek();
  }

  starPos() {
    const { zone: z, unit } = this.game;
    const { u, v } = this.star.spot;
    return { x: z.x + u * z.w, y: z.y + v * z.h + unit * 0.04, r: unit * 0.075 };
  }

  onTap(x, y) {
    if (this.state !== 'reach') return;
    const p = this.starPos();
    if (Math.hypot(x - p.x, y - p.y) < p.r * 2) this.catch();
  }

  update(dt, input) {
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.spawn();
      }
      return;
    }
    if (this.state !== 'reach') return;

    this.star.age += dt;
    const p = this.starPos();
    if (input.pointers.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < p.r * 1.5)) return this.catch();
    if (this.star.age > HINT_AFTER && !this.hinted) {
      this.hinted = true;
      this.after(speak(this.star.spot.kind === 'up' ? '손을 하늘 높이 쭉 뻗어 봐요!' : '옆으로 걸어가서 잡아 봐요!'), () => {});
    }
  }

  catch() {
    const p = this.starPos();
    const { particles, unit } = this.game;
    sfx.sparkle();
    sfx.success();
    particles.burst(p.x, p.y, { count: 30, colors: [COLORS.yellow, '#fff', '#FFE680'], speed: unit * 0.7, size: unit * 0.022, shape: 'star', gravity: 150 });
    this.pulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('별을 모두 모았어요! 최고예요!'), () => {});
      return;
    }
    this.state = 'wait';
    this.after(new Promise((resolve) => setTimeout(resolve, 600)), () => this.spawn());
  }

  draw(ctx) {
    const { w, h, unit, time } = this.game;
    // 밤하늘 느낌
    ctx.fillStyle = 'rgba(25,35,90,0.35)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      const x = ((i * 397) % 1000) / 1000;
      const y = ((i * 613) % 1000) / 1000;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 2 + i);
      star(ctx, x * w, y * h, unit * 0.008, '#fff');
    }
    ctx.globalAlpha = 1;

    if (this.state === 'reach' && this.star) {
      const p = this.starPos();
      const appear = Math.min(1, this.star.age * 3);
      const k = (Math.sin(time * 4) + 1) / 2;
      ctx.fillStyle = `rgba(255,230,128,${0.25 + k * 0.25})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.5 + k * 0.3) * appear, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(time * 2) * 0.2);
      star(ctx, 0, 0, p.r * appear, COLORS.yellow, '#fff');
      ctx.restore();
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }
}
