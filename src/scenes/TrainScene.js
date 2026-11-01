import { COLORS, star } from '../engine/draw.js';
import { train } from '../engine/scenery.js';
import { countSteps, perPerson } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework } from './common.js';

const TRACK = 4; // 출발역에서 도착역까지 거리(놀이 영역 너비 배). 열심히 달리면 10초 남짓
const STEP_BOOST = 0.16; // 한 걸음마다 빨라지는 정도
const DECAY = 0.22; // 멈추면 초당 느려지는 정도
const MAX_TRAVEL = 0.6; // 최고 속도일 때 초당 이동 거리(놀이 영역 너비 배)
const RESULT_TIME = 6; // 도착 후 기록을 보여 주는 시간(초), 그다음 다시 출발 준비
const IDLE_HINT = 6; // 달리는 중 이 시간(초) 동안 멈춰 있으면 응원
const BEST_KEY = 'motion.train.best'; // 이 기기의 최고 기록(초)을 저장하는 이름

// 저장된 최고 기록. 개인 정보가 아닌 숫자 하나라 이 기기(브라우저)에만 남긴다.
function loadBest() {
  try {
    const v = parseFloat(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // 저장할 수 없어도(사생활 보호 모드 등) 놀이는 그대로 한다.
  }
}

const fmt = (sec) => sec.toFixed(1);
// 음성용: "십이 점 삼 초"처럼 길게 읽지 않게 정수 초로
const sayTime = (sec) => `${Math.max(1, Math.round(sec))}초`;

// 칙칙폭폭 기차 경주: 제자리에서 달리면 기차가 달리고, 도착역까지 걸린 시간을 재서 최고 기록에 도전한다.
export class TrainScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.orange;
  needsMotion = true;

  constructor(game) {
    this.game = game;
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.s = unit * 0.055;
    this.railY = z.y + z.h * 0.88;
    this.trainX = z.x + z.w * 0.72;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.best = loadBest();
    this.last = null;
    this.runners = new Map(); // 아이 id → 걸음 세기 상태
    this.scroll = 0;
    this.rot = 0;
    this.smokeT = 0;
    this.ready();
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

  // 출발 준비: "준비… 셋, 둘, 하나, 출발!"
  ready() {
    this.state = 'ready';
    this.speed = 0;
    this.dist = 0;
    this.time = 0;
    this.idle = 0;
    this.count = 3;
    this.newRecord = false;
    const go = () => {
      this.state = 'run';
      this.count = 0;
      sfx.whistle();
      this.after(speak('출발!'), () => {});
    };
    const tick = (n) => {
      if (n === 0) return go();
      this.count = n;
      sfx.select();
      this.after(Promise.all([speak(['', '하나', '둘', '셋'][n]), new Promise((r) => setTimeout(r, 900))]), () => tick(n - 1));
    };
    this.after(speak(this.best ? `준비! 최고 기록은 ${sayTime(this.best)}예요.` : '준비! 도착역까지 빨리 달려요.'), () => tick(3));
  }

  onTap() {
    if (this.state === 'run') this.speed = Math.min(1, this.speed + STEP_BOOST);
  }

  update(dt, input) {
    const { zone: z, unit, particles } = this.game;

    // 걸음은 언제나 센다(준비 중 걸음 상태가 쌓이지 않게). 기차는 달리는 중에만 움직인다.
    let steps = 0;
    for (const p of perPerson(this.runners, input.people)) steps += countSteps(p.state, p.pose);

    if (this.state === 'result') {
      this.stateT -= dt;
      if (this.newRecord) {
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = 0.4;
          firework(this.game);
        }
      }
      if (this.stateT <= 0) this.ready();
      return;
    }
    if (this.state !== 'run') return;

    // 두 아이의 걸음을 모두 더한다(같이 뛰면 기차가 더 빨라진다).
    this.time += dt;
    if (steps) sfx.chug();
    this.speed = Math.min(1, Math.max(0, this.speed + steps * STEP_BOOST - DECAY * dt));
    // 화면이 많이 움직이면(달리는 중) 최소 속도를 보장해 인식이 놓쳐도 기차가 멈추지 않게 한다.
    if (input.motion > 0.05) this.speed = Math.max(this.speed, Math.min(0.6, input.motion * 5));

    let travel = this.speed * MAX_TRAVEL * dt;
    if (this.dist + travel >= TRACK) travel = TRACK - this.dist;
    this.dist += travel;
    this.scroll += travel * z.w;
    this.rot += (travel * z.w) / (this.s * 0.3);
    if (this.dist >= TRACK) return this.finish();

    this.idle = this.speed < 0.05 ? this.idle + dt : 0;
    if (this.idle > IDLE_HINT) {
      this.idle = 0;
      speak('칙칙폭폭! 제자리에서 힘껏 달려요!');
    }

    // 굴뚝 연기: 빨리 달릴수록 자주
    this.smokeT -= dt * (0.5 + this.speed * 3);
    if (this.smokeT <= 0 && this.speed > 0.05) {
      this.smokeT = 0.3;
      const s = this.s;
      particles.burst(this.trainX - s * 0.58, this.railY - s * 2.1, { count: 1, colors: ['#ffffff'], speed: unit * 0.05, size: s * 0.35, gravity: -unit * 0.15, life: 1.2 });
    }
  }

  // 도착: 걸린 시간을 보여 주고 최고 기록과 비교한다(기록이 줄면 새 기록).
  finish() {
    const t = this.time;
    this.state = 'result';
    this.speed = 0;
    this.last = t;
    this.stateT = RESULT_TIME;
    this.fireT = 0;
    sfx.whistle();
    const { unit } = this.game;
    this.game.particles.burst(this.trainX, this.railY - this.s * 2, { count: 30, colors: [COLORS.yellow, '#fff', COLORS.red], speed: unit * 0.6, size: unit * 0.02, shape: 'star', gravity: 200 });
    const prev = this.best;
    if (!prev || t < prev) {
      this.best = t;
      saveBest(t);
      this.newRecord = !!prev; // 처음 기록은 축하만, 기존 기록을 깼을 때 '새 기록'
      sfx.fanfare();
      this.stateT = RESULT_TIME + 1;
      this.after(speak(prev ? `새 기록이에요! ${sayTime(t)} 만에 도착했어요!` : `도착! ${sayTime(t)} 걸렸어요. 다음엔 더 빨리 가 볼까요?`), () => {});
    } else {
      sfx.success();
      this.after(speak(`도착! ${sayTime(t)} 걸렸어요. 최고 기록은 ${sayTime(prev)}! 다시 도전해요!`), () => {});
    }
  }

  draw(ctx) {
    const { zone: z, unit, time } = this.game;
    const s = this.s;
    const ground = this.railY;

    // 언덕(멀리 있어서 천천히 지나간다)
    ctx.fillStyle = 'rgba(155,216,138,0.75)';
    const hillGap = z.w * 0.5;
    for (let x = z.x - ((this.scroll * 0.3) % hillGap) - hillGap; x < z.x + z.w + hillGap; x += hillGap) {
      ctx.beginPath();
      ctx.ellipse(x, ground, hillGap * 0.45, z.h * 0.22, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,200,110,0.95)';
    ctx.fillRect(z.x, ground, z.w, z.y + z.h - ground);

    // 나무(가까워서 빨리 지나간다)
    const treeGap = z.w * 0.35;
    for (let x = z.x - (this.scroll % treeGap); x < z.x + z.w + treeGap; x += treeGap) {
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(x - s * 0.15, ground - s * 2.2, s * 0.3, s * 1.4);
      ctx.fillStyle = '#4FA84F';
      ctx.beginPath();
      ctx.arc(x, ground - s * 2.6, s * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // 출발역(처음에 보이다 지나감)과 도착역(가까워지면 보임)
    this.drawStation(ctx, this.trainX - this.dist * z.w, false);
    this.drawStation(ctx, this.trainX + (TRACK - this.dist) * z.w, true);

    // 레일
    ctx.fillStyle = '#8B5E3C';
    const tie = s * 1.2;
    for (let x = z.x - (this.scroll % tie); x < z.x + z.w; x += tie) ctx.fillRect(x, ground - s * 0.05, s * 0.35, s * 0.25);
    ctx.fillStyle = '#8D99AE';
    ctx.fillRect(z.x, ground - s * 0.08, z.w, s * 0.1);

    const bounce = this.speed > 0.05 ? Math.abs(Math.sin(this.rot * 0.5)) * s * 0.05 : 0;
    train(ctx, this.trainX, ground - bounce, s, this.rot, []);

    this.drawProgress(ctx);
    this.drawTimer(ctx);
    this.drawSpeed(ctx, unit);
    if (this.state === 'ready' && this.count > 0) this.drawCount(ctx, time);
  }

  // 역 건물. goal = 도착역(체크무늬 깃발)
  drawStation(ctx, sx, goal) {
    const { zone: z } = this.game;
    const s = this.s;
    const ground = this.railY;
    if (sx < z.x - s * 6 || sx > z.x + z.w + s * 6) return;
    const x = sx - s * 4;
    ctx.fillStyle = '#E9C893';
    ctx.fillRect(x - s * 2.5, ground - s * 0.5, s * 5, s * 0.5);
    ctx.fillStyle = goal ? COLORS.red : COLORS.blue;
    ctx.fillRect(x - s * 2.2, ground - s * 3.4, s * 4.4, s * 0.35);
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(x - s * 2.0, ground - s * 3.1, s * 0.25, s * 2.6);
    ctx.fillRect(x + s * 1.75, ground - s * 3.1, s * 0.25, s * 2.6);
    if (!goal) return;
    // 도착 깃발
    const fx = sx + s * 1.5;
    ctx.fillStyle = '#5A3E2B';
    ctx.fillRect(fx - s * 0.08, ground - s * 4.6, s * 0.16, s * 4.6);
    const cell = s * 0.4;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#fff' : COLORS.ink;
        ctx.fillRect(fx + s * 0.08 + c * cell, ground - s * 4.6 + r * cell, cell, cell);
      }
    }
  }

  // 위쪽: 출발역 → 도착역 길에서 기차가 어디쯤인지
  drawProgress(ctx) {
    const { w, h, unit } = this.game;
    const len = Math.min(w * 0.5, unit * 0.8);
    const x0 = w / 2 - len / 2;
    const y = h * 0.06 + unit * 0.03;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.roundRect(x0 - unit * 0.04, y - unit * 0.035, len + unit * 0.08, unit * 0.07, unit * 0.035);
    ctx.fill();
    ctx.strokeStyle = '#8D99AE';
    ctx.lineWidth = unit * 0.008;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + len, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.blue;
    ctx.beginPath();
    ctx.arc(x0, y, unit * 0.014, 0, Math.PI * 2);
    ctx.fill();
    star(ctx, x0 + len, y, unit * 0.022, COLORS.yellow, '#F4A100');
    // 작은 기차(빨간 동그라미 + 굴뚝)
    const k = Math.min(1, this.dist / TRACK);
    const tx = x0 + len * k;
    ctx.fillStyle = COLORS.red;
    ctx.beginPath();
    ctx.roundRect(tx - unit * 0.022, y - unit * 0.018, unit * 0.044, unit * 0.03, unit * 0.008);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(tx + unit * 0.006, y - unit * 0.032, unit * 0.01, unit * 0.016);
    ctx.restore();
  }

  // 오른쪽 위: 지금 걸린 시간(큰 숫자) + 최고 기록(왕관 옆)
  drawTimer(ctx) {
    const { zone: z, unit, time } = this.game;
    const x = z.x + z.w - unit * 0.02;
    const y = z.y + unit * 0.11;
    const showing = this.state === 'result' ? this.last : this.time;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const big = unit * (this.state === 'result' ? 0.11 + Math.sin(time * 6) * 0.004 : 0.09);
    ctx.font = `900 ${big}px system-ui, sans-serif`;
    const text = `${fmt(showing)}초`;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = big * 0.16;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = this.newRecord && this.state === 'result' ? COLORS.red : COLORS.ink;
    ctx.fillText(text, x, y);
    if (this.best) {
      const small = unit * 0.045;
      ctx.font = `800 ${small}px system-ui, sans-serif`;
      const bt = `${fmt(this.best)}초`;
      const by = y + big * 0.85;
      ctx.lineWidth = small * 0.2;
      ctx.strokeText(bt, x, by);
      ctx.fillStyle = '#C98A00';
      ctx.fillText(bt, x, by);
      const tw = ctx.measureText(bt).width;
      drawCrown(ctx, x - tw - small * 0.8, by, small * 0.55);
    }
    ctx.restore();
  }

  // 출발 전 큰 숫자 3, 2, 1
  drawCount(ctx, time) {
    const { w, h, unit } = this.game;
    const k = 1 + (time % 1) * 0.15;
    ctx.save();
    ctx.font = `900 ${unit * 0.28 * k}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = unit * 0.03;
    ctx.strokeText(String(this.count), w / 2, h * 0.42);
    ctx.fillStyle = [COLORS.green, COLORS.green, COLORS.yellow, COLORS.red][this.count];
    ctx.fillText(String(this.count), w / 2, h * 0.42);
    ctx.restore();
  }

  // 오른쪽 속도 막대(빨리 달릴수록 차오른다). 왼쪽 가운데는 집 버튼 자리라 오른쪽에 둔다.
  drawSpeed(ctx, unit) {
    const { zone: z } = this.game;
    const w = unit * 0.035;
    const h = z.h * 0.4;
    const x = z.x + z.w - unit * 0.06 - w;
    const y = z.y + z.h * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w / 2);
    ctx.fill();
    const fill = h * this.speed;
    if (fill > 1) {
      const g = ctx.createLinearGradient(0, y + h, 0, y);
      g.addColorStop(0, COLORS.green);
      g.addColorStop(0.6, COLORS.yellow);
      g.addColorStop(1, COLORS.red);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y + h - fill, w, fill, w / 2);
      ctx.fill();
    }
  }
}

// 최고 기록 표시용 왕관
function drawCrown(ctx, x, y, s) {
  ctx.fillStyle = COLORS.yellow;
  ctx.strokeStyle = '#C98A00';
  ctx.lineWidth = s * 0.12;
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.6);
  ctx.lineTo(x - s, y - s * 0.4);
  ctx.lineTo(x - s * 0.5, y + s * 0.1);
  ctx.lineTo(x, y - s * 0.7);
  ctx.lineTo(x + s * 0.5, y + s * 0.1);
  ctx.lineTo(x + s, y - s * 0.4);
  ctx.lineTo(x + s, y + s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
