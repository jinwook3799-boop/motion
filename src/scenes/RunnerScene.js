import { rabbit } from '../engine/animals.js';
import { COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { flyingBird, log } from '../engine/scenery.js';
import { bodyHeight } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework } from './common.js';

const GOAL = 10;
const SPEED = 0.25; // 장애물이 다가오는 속도(놀이 영역 너비/초) — 유아용으로 느긋하게
const SPAWN_GAP = [3.2, 4.4]; // 장애물 간격(초)
const JUMP_TIME = 0.9; // 토끼가 공중에 떠 있는 시간(초)
const DUCK_HOLD = 0.35; // 일어선 뒤에도 이만큼(초)은 앉은 것으로 봐준다
const CUE_TIME = 1.5; // 도착 이만큼(초) 전에 "점프!"/"앉아!" 알려 주기
const BIRD_CHANCE = 0.4;

// 장애물 점프 달리기: 통나무는 점프, 낮게 나는 새는 쪼그려 앉기
export class RunnerScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.pink;

  constructor(game) {
    this.game = game;
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.s = unit * 0.07;
    this.runnerX = z.x + z.w * 0.22;
    this.groundY = z.y + z.h * 0.86;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.obstacles = [];
    this.scroll = 0;
    this.jumpT = Infinity;
    this.duckT = 0;
    this.stumbleT = 0;
    this.height = {};
    this.lastHeight = 'stand';
    this.after(speak('통나무가 오면 점프! 새가 오면 쏙 앉아요! 출발!'), () => {
      this.state = 'run';
      this.spawnT = 0.5;
    });
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

  get airborne() {
    return this.jumpT < JUMP_TIME;
  }

  get ducking() {
    return this.duckT > 0;
  }

  startJump() {
    if (this.airborne) return;
    this.jumpT = 0;
    sfx.jump();
  }

  // 보호자·PC 테스트용: 화면 위쪽 터치 = 점프, 아래쪽 = 앉기
  onTap(x, y) {
    if (y < this.game.h / 2) this.startJump();
    else this.duckT = 0.8;
  }

  update(dt, input) {
    this.t += dt;
    this.jumpT += dt;
    this.duckT = Math.max(0, this.duckT - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    if (input.pose) {
      const h = bodyHeight(this.height, input.pose, dt);
      if (h === 'up' && this.lastHeight !== 'up') this.startJump();
      if (h === 'down') this.duckT = DUCK_HOLD;
      if (h) this.lastHeight = h;
    }
    if (this.state === 'intro') return;

    const { zone: z } = this.game;
    const v = SPEED * z.w;
    this.scroll += v * dt;

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.state = 'run';
      }
    } else {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.obstacles.push({ kind: Math.random() < BIRD_CHANCE ? 'bird' : 'log', x: z.x + z.w + this.s * 2, passed: false, cued: false });
        this.spawnT = SPAWN_GAP[0] + Math.random() * (SPAWN_GAP[1] - SPAWN_GAP[0]);
      }
    }

    for (const o of this.obstacles) {
      o.x -= v * dt;
      if (!o.cued && (o.x - this.runnerX) / v < CUE_TIME) {
        o.cued = true;
        speak(o.kind === 'log' ? '점프!' : '앉아!');
      }
      if (!o.passed && o.x <= this.runnerX) {
        o.passed = true;
        this.judge(o);
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x > z.x - this.s * 3);
  }

  judge(o) {
    const ok = o.kind === 'log' ? this.airborne : this.ducking;
    const { particles, unit } = this.game;
    const y = this.groundY - this.s * 1.5;
    if (ok) {
      sfx.sparkle();
      particles.burst(this.runnerX, y, { count: 20, colors: [COLORS.yellow, '#fff', COLORS.pink], speed: unit * 0.5, size: unit * 0.02, shape: 'star', gravity: 200 });
      if (this.state !== 'run') return;
      this.pulse[this.score] = 1;
      this.score++;
      if (this.score >= GOAL) {
        this.state = 'celebrate';
        this.stateT = 3.5;
        this.fireT = 0;
        sfx.fanfare();
        speak('점프 대장! 정말 잘했어요!');
      }
    } else {
      // 부딪혀도 벌점은 없다. 다음에 어떻게 하는지만 알려 준다.
      this.stumbleT = 0.6;
      sfx.oops();
      speak(o.kind === 'log' ? '통나무가 오면 점프!' : '새가 오면 쏙 앉아요!');
    }
  }

  draw(ctx) {
    const { zone: z, unit } = this.game;
    const s = this.s;

    // 땅과 움직이는 풀
    ctx.fillStyle = 'rgba(155,216,138,0.9)';
    ctx.fillRect(z.x, this.groundY, z.w, z.y + z.h - this.groundY);
    ctx.strokeStyle = '#7BC86C';
    ctx.lineWidth = unit * 0.008;
    ctx.lineCap = 'round';
    const gap = s * 1.6;
    for (let x = z.x - (this.scroll % gap); x < z.x + z.w; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, this.groundY + s * 0.3);
      ctx.lineTo(x - s * 0.2, this.groundY + s * 0.05);
      ctx.moveTo(x + s * 0.15, this.groundY + s * 0.3);
      ctx.lineTo(x + s * 0.25, this.groundY + s * 0.02);
      ctx.stroke();
    }

    for (const o of this.obstacles) {
      if (o.kind === 'log') log(ctx, o.x, this.groundY - s * 0.45, s);
      else flyingBird(ctx, o.x, this.groundY - s * 2.3, s * 0.9, this.t);
      // 다가올 때 할 동작 화살표(위 = 점프, 아래 = 앉기)
      if (o.cued && !o.passed) this.drawCue(ctx, o);
    }

    // 토끼
    const jumpY = this.airborne ? -Math.sin((Math.PI * this.jumpT) / JUMP_TIME) * s * 2.6 : 0;
    const run = this.state === 'intro' ? 0 : Math.abs(Math.sin(this.t * 10)) * s * 0.15;
    ctx.save();
    ctx.translate(this.runnerX, this.groundY);
    if (this.stumbleT > 0) ctx.rotate(Math.sin(this.stumbleT * 30) * 0.2);
    if (this.ducking && !this.airborne) ctx.scale(1.2, 0.6);
    rabbit(ctx, 0, -s + jumpY - run, s, this.t);
    ctx.restore();

    if (this.state === 'intro') this.drawIntroHint(ctx);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  drawCue(ctx, o) {
    const s = this.s;
    const up = o.kind === 'log';
    const y = (up ? this.groundY - s * 2.0 : this.groundY - s * 3.6) + Math.sin(this.t * 8) * s * 0.15;
    ctx.fillStyle = up ? COLORS.green : COLORS.orange;
    ctx.beginPath();
    if (up) {
      ctx.moveTo(o.x, y - s * 0.5);
      ctx.lineTo(o.x - s * 0.45, y + s * 0.1);
      ctx.lineTo(o.x + s * 0.45, y + s * 0.1);
    } else {
      ctx.moveTo(o.x, y + s * 0.5);
      ctx.lineTo(o.x - s * 0.45, y - s * 0.1);
      ctx.lineTo(o.x + s * 0.45, y - s * 0.1);
    }
    ctx.fill();
  }

  // 시작 전: 통나무→점프, 새→앉기 그림 안내
  drawIntroHint(ctx) {
    const { w, zone: z } = this.game;
    const s = this.s;
    const y = z.y + z.h * 0.42;
    log(ctx, w / 2 - s * 3.5, y, s);
    flyingBird(ctx, w / 2 + s * 3.5, y - s * 0.3, s, this.t);
    for (const [x, up, color] of [[w / 2 - s * 3.5, true, COLORS.green], [w / 2 + s * 3.5, false, COLORS.orange]]) {
      const ay = up ? y - s * 1.4 : y + s * 1.1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, ay + (up ? -s * 0.5 : s * 0.5));
      ctx.lineTo(x - s * 0.45, ay + (up ? s * 0.1 : -s * 0.1));
      ctx.lineTo(x + s * 0.45, ay + (up ? s * 0.1 : -s * 0.1));
      ctx.fill();
    }
  }
}
