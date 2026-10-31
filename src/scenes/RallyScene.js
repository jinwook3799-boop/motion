import { COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 10; // 이만큼 주고받으면 축하
const GRAVITY = 0.45; // 놀이 영역 높이/초² — 비치볼처럼 둥실둥실
const FLIGHT = 2.2; // 쳐서 반대편까지 날아가는 시간(초)
const HIT_COOLDOWN = 0.35; // 같은 공을 연달아 여러 번 친 것으로 세지 않게

// 공 주고받기 랠리: 공을 치면 반대편 친구에게 날아간다. 떨어뜨리지 않고 몇 번 주고받는지 센다.
export class RallyScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  // 화면 왼쪽 아이는 파랑, 오른쪽 아이는 분홍
  avatarColorOf(person) {
    const z = this.game.zone;
    return PLAYER_COLORS[person.center.x < z.x + z.w / 2 ? 0 : 1];
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.rally = 0;
    this.best = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.ball = null;
    this.state = 'intro';
    this.after(speak('공이 간다!'), () => this.serve());
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
    return this.game.unit * 0.075;
  }

  serve() {
    const z = this.game.zone;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.ball = { x: z.x + z.w / 2, y: z.y + z.h * 0.2, vx: dir * z.w * 0.1, vy: 0, spin: 0, lastHit: -1 };
    this.rally = 0;
    this.state = 'play';
    sfx.whoosh();
  }

  onTap(x, y) {
    if (this.state === 'play' && Math.hypot(x - this.ball.x, y - this.ball.y) < this.r * 1.6) this.hit();
  }

  update(dt, input) {
    const { zone: z, time } = this.game;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) this.serve();
      return;
    }
    if (this.state !== 'play') return;

    const b = this.ball;
    const r = this.r;
    b.vy += GRAVITY * z.h * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin += b.vx * dt * 0.02;
    // 양옆 벽과 천장에서 튕긴다.
    if (b.x < z.x + r) Object.assign(b, { x: z.x + r, vx: Math.abs(b.vx) });
    if (b.x > z.x + z.w - r) Object.assign(b, { x: z.x + z.w - r, vx: -Math.abs(b.vx) });
    if (b.y < z.y + r) Object.assign(b, { y: z.y + r, vy: Math.abs(b.vy) * 0.5 });

    const pad = this.game.unit * 0.03;
    if (time - b.lastHit > HIT_COOLDOWN && input.pointers.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < r + pad)) this.hit();

    if (b.y - r > z.y + z.h) this.drop();
  }

  // 공이 있는 쪽의 반대편 가운데로 포물선을 그리며 날아가게 한다.
  hit() {
    const { zone: z, unit, particles, time } = this.game;
    const b = this.ball;
    b.lastHit = time;
    const target = b.x < z.x + z.w / 2 ? z.x + z.w * 0.75 : z.x + z.w * 0.25;
    b.vx = (target - b.x) / FLIGHT;
    b.vy = (-GRAVITY * z.h * FLIGHT) / 2;
    sfx.bonk();
    particles.ring(b.x, b.y, { color: '#fff', size: this.r });
    particles.burst(b.x, b.y, { count: 10, colors: [COLORS.yellow, '#fff'], speed: unit * 0.4, size: unit * 0.015, shape: 'star', gravity: 200 });
    if (this.rally < GOAL) this.pulse[this.rally] = 1;
    this.rally++;
    if (this.rally === GOAL) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('와! 공을 열 번이나 주고받았어요! 최고예요!'), () => {});
    }
  }

  drop() {
    this.best = Math.max(this.best, this.rally);
    this.state = 'drop';
    sfx.oops();
    this.after(speak(this.rally >= 3 ? '앗, 떨어졌어요! 그래도 잘했어요! 다시 해요!' : '앗! 다시 해 볼까요?'), () => this.serve());
  }

  draw(ctx) {
    const { zone: z, unit } = this.game;
    // 가운데 네트
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = unit * 0.01;
    ctx.setLineDash([unit * 0.03, unit * 0.025]);
    ctx.beginPath();
    ctx.moveTo(z.x + z.w / 2, z.y + z.h * 0.45);
    ctx.lineTo(z.x + z.w / 2, z.y + z.h);
    ctx.stroke();
    ctx.restore();

    if (this.ball && this.state !== 'drop') this.drawBall(ctx, this.ball);

    // 주고받은 횟수(숫자)
    if (this.rally > 0) {
      ctx.fillStyle = COLORS.purple;
      ctx.font = `bold ${unit * 0.09}px "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.rally), z.x + z.w / 2, z.y + z.h * 0.18);
    }
    starGauge(ctx, this.game, GOAL, Math.min(this.rally, GOAL), this.pulse);
  }

  // 알록달록 비치볼
  drawBall(ctx, b) {
    const r = this.r;
    const colors = [COLORS.red, '#fff', COLORS.blue, '#fff', COLORS.yellow, '#fff'];
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
      ctx.fill();
    });
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(61,44,46,0.25)';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
