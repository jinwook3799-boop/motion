import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { rabbit } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { drawAvatar, P, perPerson, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';
import { turnMarker } from './BaseballScene.js';

// 단계: travel = 토끼 라켓에서 아이 앞 칠 자리까지 오는 시간(초), reach = 몸 가운데에서 옆으로(어깨너비 배),
// heights = 칠 자리 높이(어깨선 기준, 양수 = 아래), rest = 다음 공까지 쉬는 시간(3단계는 랠리라 짧게)
const LEVELS = [
  { goal: 8, travel: 2.5, reach: [1.0, 1.5], heights: [0.5, 0.8], rest: 1.2 },
  { goal: 10, travel: 2.0, reach: [1.2, 1.9], heights: [0.1, 0.5, 0.9], rest: 1.0 },
  { goal: 10, travel: 1.7, reach: [1.3, 2.1], heights: [-0.2, 0.4, 0.9], rest: 0.25 },
];
// ---- 라켓·판정(어깨너비 sw 배, 실제 아이와 해 보며 조정할 추정값) ----
const RACKET_LEN = 1.15; // 손목에서 라켓 머리 가운데까지
const HEAD_R = 0.45; // 라켓 머리 반지름(판정은 넉넉하게 이것보다 크게)
const HIT_R = 0.75; // 라켓 머리가 지나간 길이 공에서 이 거리 안이면 맞음
const SWING_SPEED = 2.2; // 라켓 머리가 이 빠르기(sw/초) 이상이면 휘두른 것
const SMASH_SPEED = 6; // 이 이상이면 '스매시!'
const SWITCH_MORE = 0.4; // 다른 손이 공에 이만큼 더 가까우면 라켓을 그 손으로(잠깐 유지)
const SWITCH_HOLD = 0.3;
const HIT_FROM = 0.72; // 공이 이만큼(0~1) 왔을 때부터 칠 수 있다
const LATE = 0.3; // 칠 자리를 지나고도 이 시간(초)은 칠 수 있다
const BOUNCE_AT = 0.58; // 공이 이만큼 왔을 때 바닥에 한 번 통
const RETURN_TIME = 0.8; // 친 공이 토끼 쪽으로 넘어가는 시간(초)
const ASSIST_AFTER = 2; // 연달아 놓치면 다음 공은 느리고 가깝게
const HIT_VOICES = ['나이스 샷!', '퐁! 잘 쳤어요!', '멋진 스윙!'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const between = ([a, b]) => a + Math.random() * (b - a);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + dx * k - px, ay + dy * k - py);
}

// 테니스 놀이: 네트 건너 토끼가 공을 넘기면 공이 한 번 통 튀어 아이 옆(칠 자리 동그라미)으로 온다.
// 손에 생긴 라켓을 휙 휘둘러 넘기면 별! 3단계는 토끼가 바로바로 받아치는 랠리.
// 못 쳐도 벌점 없이 "아깝다!", 두 명이면 번갈아 친다(차례인 아이 머리 위 표시).
export class TennisScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColorOf = (person) => this.colorOf(person.id);

  constructor(game) {
    this.game = game;
    this.colors = new Map();
    this.people = [];
  }

  onResize() {
    const { unit, zone: z, h } = this.game;
    this.S = unit * 0.045;
    this.ox = z.x + z.w / 2;
    this.oy = Math.max(z.y + z.h * 0.24, h * 0.055 + unit * 0.035 * 6.4 + this.S * 1.4);
    this.farY = this.oy + this.S * 1.6; // 토끼 발밑(먼 코트 끝)
    this.netY = lerp(this.farY, z.y + z.h, 0.28);
    this.ballR ??= unit * 0.035;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.t = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.states = new Map();
    this.colors = new Map();
    this.people = [];
    this.lastTargetId = null;
    this.lastSide = 0;
    this.resetLevel();
    this.state = 'intro';
    this.after(speak('테니스 놀이! 공이 통 튀어서 동그라미로 오면 라켓을 휙! 휘둘러 넘겨요!'), () => this.rest(0.3));
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

  resetLevel() {
    this.score = 0;
    this.pulse = new Array(Math.max(...LEVELS.map((l) => l.goal))).fill(0);
    this.missStreak = 0;
    this.rally = 0;
    this.ball = null;
    this.spot = null;
    this.oppSwingT = -9;
  }

  colorOf(id) {
    if (!this.colors.has(id)) {
      const present = new Set(this.people.filter((p) => p.id !== id).map((p) => this.colors.get(p.id)));
      this.colors.set(id, PLAYER_COLORS.find((c) => !present.has(c)) ?? PLAYER_COLORS[0]);
    }
    return this.colors.get(id);
  }

  rest(time) {
    this.state = 'rest';
    this.stateT = time;
    this.spot = null;
  }

  get assisted() {
    return this.missStreak >= ASSIST_AFTER;
  }

  // 토끼가 공을 넘긴다: 이번 차례 아이 옆에 칠 자리를 정한다.
  serve() {
    const people = this.people.filter((p) => !p.lost && shoulders(p.pose));
    let target = people[0] ?? null;
    if (people.length >= 2) target = people.find((p) => p.id !== this.lastTargetId) ?? people[0];
    this.targetId = target?.id ?? null;
    if (target) this.lastTargetId = target.id;
    const cfg = this.assisted ? LEVELS[0] : this.cfg;
    const { zone: z, unit, homeButton: hb } = this.game;
    const sh = target ? shoulders(target.pose) : null;
    const mx = sh ? sh.mx : z.x + z.w / 2;
    const my = sh ? sh.my : z.y + z.h * 0.5;
    const sw = sh ? sh.sw : unit * 0.12;
    this.ballR = clamp(sw * 0.3, unit * 0.025, unit * 0.055);
    const r = this.ballR * 1.6;
    let side = Math.random() < 0.5 ? -1 : 1;
    if (side === this.lastSide && Math.random() < 0.5) side = -side;
    let x = mx + side * between(cfg.reach) * sw;
    if (x < z.x + r || x > z.x + z.w - r) {
      x = mx - (x - mx);
      side = -side;
    }
    this.lastSide = side;
    x = clamp(x, z.x + r, z.x + z.w - r);
    let y = clamp(my + pick(cfg.heights) * sw, this.netY + r, z.y + z.h - r);
    if (hb && Math.hypot(x - hb.x, y - hb.y) < hb.r + r) y = hb.y + hb.r + r;
    this.spot = { x, y, sw };
    const from = { x: this.ox + this.S * 0.9, y: this.oy + this.S * 0.1 };
    const travel = cfg.travel * (this.assisted ? 1.25 : 1);
    this.ball = { from, to: { x, y }, t: 0, travel, k: 0, x: from.x, y: from.y, scale: 0.35, mode: 'in', spin: 0 };
    this.state = 'incoming';
    this.oppSwingT = this.t;
    sfx.bonk();
  }

  onTap(x, y) {
    const b = this.ball;
    if (this.state !== 'incoming' || b.k < HIT_FROM * 0.8) return;
    if (Math.hypot(x - b.x, y - b.y) < this.ballR * b.scale * 3) this.hit(4);
  }

  // ---------------- 진행 ----------------

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < this.pulse.length; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.people = input.people;
    for (const p of this.people) this.colorOf(p.id);
    this.updateRackets(dt);

    switch (this.state) {
      case 'rest':
        this.stateT -= dt;
        if (this.stateT <= 0) this.serve();
        break;
      case 'incoming':
        this.updateIncoming(dt);
        break;
      case 'return':
        this.updateReturn(dt);
        break;
      case 'miss': {
        // 놓친 공은 아이 뒤로 데굴데굴 굴러 나간다.
        const b = this.ball;
        this.stateT -= dt;
        b.y += dt * this.game.unit * 0.3;
        b.scale += dt * 0.4;
        b.alpha = clamp(this.stateT / 0.6, 0, 1);
        if (this.stateT <= 0) {
          this.ball = null;
          this.rest(this.cfg.rest + 0.4);
        }
        break;
      }
      case 'celebrate':
        this.stateT -= dt;
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = 0.35;
          firework(this.game);
        }
        if (this.stateT <= 0) this.nextLevel();
        break;
    }
  }

  // 아이마다 라켓 하나: 공(칠 자리)에 더 가까운 손에, 팔꿈치 → 손목 방향으로.
  updateRackets(dt) {
    const now = this.game.time;
    const goal = this.spot ?? null;
    for (const p of perPerson(this.states, this.people)) {
      const s = p.state;
      if (p.lost) continue;
      const pose = p.pose;
      const sh = shoulders(pose);
      if (!sh) {
        s.racket = null;
        continue;
      }
      const wristOf = (side) => {
        const w = pose[side === 'l' ? P.lWrist : P.rWrist];
        return visible(w, 0.3) ? w : null;
      };
      // 칠 자리에 가까운 손(칠 자리가 없으면 화면 바깥쪽으로 더 나간 손)
      const score = (side) => {
        const w = wristOf(side);
        if (!w) return Infinity;
        return goal ? Math.hypot(w.x - goal.x, w.y - goal.y) / sh.sw : -Math.abs(w.x - sh.mx) / sh.sw;
      };
      s.hand ??= score('r') <= score('l') ? 'r' : 'l';
      const other = s.hand === 'l' ? 'r' : 'l';
      if (score(other) + SWITCH_MORE < score(s.hand)) {
        s.switchT = (s.switchT ?? 0) + dt;
        if (s.switchT > SWITCH_HOLD || !wristOf(s.hand)) {
          s.hand = other;
          s.switchT = 0;
          s.dir = null;
          s.racket = null;
        }
      } else s.switchT = 0;
      const w = wristOf(s.hand);
      if (!w) {
        s.racket = null;
        continue;
      }
      const e = pose[s.hand === 'l' ? P.lElbow : P.rElbow];
      const from = visible(e, 0.3) ? e : s.hand === 'l' ? sh.ls : sh.rs;
      let dx = w.x - from.x;
      let dy = w.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      if (s.dir) {
        const k = Math.min(1, dt * 18);
        dx = lerp(s.dir.x, dx, k);
        dy = lerp(s.dir.y, dy, k);
        const n = Math.hypot(dx, dy) || 1;
        dx /= n;
        dy /= n;
      }
      s.dir = { x: dx, y: dy };
      const head = { x: w.x + dx * RACKET_LEN * sh.sw, y: w.y + dy * RACKET_LEN * sh.sw };
      const prev = s.racket?.head;
      const dtp = now - (s.racket?.t ?? now);
      const speed = prev && dtp > 0 ? Math.hypot(head.x - prev.x, head.y - prev.y) / dtp / sh.sw : 0;
      s.racket = { hand: { x: w.x, y: w.y }, head, prevHead: prev ?? head, prevHand: s.racket?.hand ?? { x: w.x, y: w.y }, speed: lerp(s.racket?.speed ?? 0, speed, 0.6), t: now, sw: sh.sw, color: this.colorOf(p.id), id: p.id };
    }
  }

  get rackets() {
    const out = [];
    for (const [id, s] of this.states) if (s.racket && this.people.some((p) => p.id === id && !p.lost)) out.push(s.racket);
    return out;
  }

  updateIncoming(dt) {
    const b = this.ball;
    b.t += dt;
    const k = b.t / b.travel;
    b.k = k;
    const { zone: z } = this.game;
    const bounceY = lerp(this.farY, z.y + z.h, BOUNCE_AT * 0.95);
    if (k <= 1) {
      b.x = lerp(b.from.x, b.to.x, k);
      if (k < BOUNCE_AT) {
        const q = k / BOUNCE_AT;
        b.y = lerp(b.from.y, bounceY, q) - Math.sin(Math.PI * q) * this.S * 2.2;
        if (!b.bounced && q > 0.97) {
          b.bounced = true;
          sfx.bloop();
        }
      } else {
        const q = (k - BOUNCE_AT) / (1 - BOUNCE_AT);
        b.y = lerp(bounceY, b.to.y, easeOut(q)) - Math.sin(Math.PI * q * 0.8) * this.S * 1.2;
      }
      b.scale = lerp(0.35, 1, k ** 1.4);
      b.shadowY = lerp(this.farY, z.y + z.h - this.ballR, k);
    } else {
      // 칠 자리를 지나 조금 더 다가온다(아직 칠 수 있음).
      const over = (b.t - b.travel) / LATE;
      b.x = b.to.x + (b.to.x - b.from.x) * 0.06 * over;
      b.y = b.to.y + this.S * 0.4 * over;
      b.scale = 1 + 0.15 * over;
      if (over >= 1) return this.missed();
    }
    b.spin += dt * 12;
    if (k >= HIT_FROM) {
      for (const r of this.rackets) {
        if (r.speed < SWING_SPEED) continue;
        const reach = this.ballR * b.scale + HIT_R * r.sw;
        const d = Math.min(segDist(r.prevHead.x, r.prevHead.y, r.head.x, r.head.y, b.x, b.y), segDist(r.hand.x, r.hand.y, r.head.x, r.head.y, b.x, b.y));
        if (d < reach) return this.hit(r.speed);
      }
    }
  }

  hit(speed) {
    const b = this.ball;
    const smash = speed >= SMASH_SPEED;
    const { particles, unit } = this.game;
    sfx.bonk();
    sfx.success();
    particles.burst(b.x, b.y, { count: smash ? 30 : 18, colors: smash ? RAINBOW : ['#fff', COLORS.yellow], speed: unit * 0.45, size: unit * 0.014, shape: 'star', gravity: 200 });
    particles.ring(b.x, b.y, { color: '#fff', size: this.ballR * 2.5 });
    this.missStreak = 0;
    this.rally++;
    this.pulse[this.score] = 1;
    this.score++;
    if (smash) speak('스매시! 최고예요!');
    else if (this.level === 3 && this.rally >= 3) speak(`랠리 ${this.rally}번!`);
    else speak(pick(HIT_VOICES));
    // 토끼 코트 아무 데로나 넘어간다.
    const to = { x: this.ox + (Math.random() - 0.5) * this.S * 6, y: this.farY - this.S * (0.3 + Math.random() * 0.6) };
    b.ret = { from: { x: b.x, y: b.y, scale: b.scale }, to, t: 0, time: RETURN_TIME * (smash ? 0.7 : 1), smash };
    this.state = 'return';
    this.spot = null;
  }

  updateReturn(dt) {
    const b = this.ball;
    const r = b.ret;
    r.t += dt;
    const k = Math.min(1, r.t / r.time);
    b.x = lerp(r.from.x, r.to.x, k);
    b.y = lerp(r.from.y, r.to.y, k) - Math.sin(Math.PI * k) * this.S * (r.smash ? 1.2 : 3);
    b.scale = lerp(r.from.scale, 0.3, k);
    b.spin += dt * 16;
    b.shadowY = lerp(this.game.zone.y + this.game.zone.h - this.ballR, this.farY, k);
    if (k >= 1) {
      this.ball = null;
      if (this.score >= this.cfg.goal) return this.celebrate();
      // 3단계 랠리: 토끼가 바로 받아친다.
      this.rest(this.cfg.rest);
    }
  }

  missed() {
    this.state = 'miss';
    this.stateT = 0.9;
    this.spot = null;
    this.missStreak++;
    this.rally = 0;
    sfx.boing();
    if (this.missStreak === ASSIST_AFTER) speak('괜찮아요! 동그라미 옆에 라켓을 대고 있다가 휙!');
    else if (this.missStreak % 2 === 1) speak('아깝다! 다시 쳐 봐요!');
  }

  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    sfx.fanfare();
    speak(last ? '랠리 성공! 최고의 테니스 선수예요!' : this.level === 1 ? '잘 쳤어요! 2단계! 공이 더 멀리, 더 빨리 와요!' : '대단해요! 3단계! 토끼와 쉬지 않고 랠리해요!');
  }

  nextLevel() {
    this.level = this.level >= LEVELS.length ? 1 : this.level + 1;
    this.levelPulse = 1;
    this.resetLevel();
    this.rest(0.8);
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    this.drawCourt(ctx);
    this.drawOpponent(ctx);
    for (const p of this.people) drawAvatar(ctx, p.pose, this.colorOf(p.id));
    if (this.spot && this.state === 'incoming') this.drawSpot(ctx);
    for (const r of this.rackets) racket(ctx, r.hand, r.head, r.sw, r.color);
    if (this.ball) this.drawBall(ctx);
    if (this.targetId !== null && this.people.filter((p) => !p.lost).length >= 2 && (this.state === 'incoming' || this.state === 'rest')) {
      const p = this.people.find((q) => q.id === this.targetId);
      const sh = p && shoulders(p.pose);
      if (sh) turnMarker(ctx, sh.mx, sh.my - sh.sw * 1.6, sh.sw * 0.28, this.colorOf(p.id), this.t);
    }
    starGauge(ctx, this.game, this.cfg.goal, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  // 원근감 있는 초록 코트 + 하얀 선 + 네트
  drawCourt(ctx) {
    const { zone: z, unit } = this.game;
    const far = this.farY - this.S * 0.8;
    const near = z.y + z.h;
    const cx = this.ox;
    const farW = this.S * 5.5;
    const nearW = z.w * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    ctx.fillStyle = 'rgba(178,224,255,0.45)';
    ctx.fillRect(z.x, z.y, z.w, far - z.y);
    ctx.fillStyle = 'rgba(110,190,120,0.45)';
    ctx.fillRect(z.x, far, z.w, near - far);
    ctx.fillStyle = 'rgba(70,150,200,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - farW, far);
    ctx.lineTo(cx + farW, far);
    ctx.lineTo(cx + nearW, near);
    ctx.lineTo(cx - nearW, near);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = unit * 0.005;
    ctx.stroke();
    // 가운데 선·서비스 선
    ctx.beginPath();
    ctx.moveTo(cx, lerp(far, this.netY, 0.35));
    ctx.lineTo(cx, lerp(this.netY, near, 0.55));
    for (const k of [0.35, 0.55]) {
      const y = k === 0.35 ? lerp(far, this.netY, k) : lerp(this.netY, near, k);
      const wk = (y - far) / (near - far);
      const hw = lerp(farW, nearW, wk) * 0.78;
      ctx.moveTo(cx - hw, y);
      ctx.lineTo(cx + hw, y);
    }
    ctx.stroke();
    // 네트
    const wk = (this.netY - far) / (near - far);
    const hw = lerp(farW, nearW, wk) * 1.08;
    const nh = this.S * 1.0;
    ctx.fillStyle = 'rgba(40,40,50,0.25)';
    ctx.fillRect(cx - hw, this.netY - nh, hw * 2, nh);
    ctx.strokeStyle = 'rgba(40,40,50,0.35)';
    ctx.lineWidth = Math.max(1, unit * 0.0015);
    ctx.beginPath();
    for (let x = cx - hw; x <= cx + hw; x += nh * 0.25) {
      ctx.moveTo(x, this.netY - nh);
      ctx.lineTo(x, this.netY);
    }
    for (let y = this.netY - nh; y <= this.netY; y += nh * 0.25) {
      ctx.moveTo(cx - hw, y);
      ctx.lineTo(cx + hw, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - hw, this.netY - nh - unit * 0.004, hw * 2, unit * 0.008);
    ctx.fillStyle = 'rgba(61,44,46,0.6)';
    ctx.fillRect(cx - hw - unit * 0.004, this.netY - nh * 1.1, unit * 0.008, nh * 1.1);
    ctx.fillRect(cx + hw - unit * 0.004, this.netY - nh * 1.1, unit * 0.008, nh * 1.1);
    ctx.restore();
  }

  // 토끼 선수: 공을 칠 때 라켓을 휘두르고, 아이가 넘긴 공이 오면 폴짝
  drawOpponent(ctx) {
    const S = this.S;
    const x = this.ox;
    const y = this.oy;
    const since = this.t - this.oppSwingT;
    const swing = since < 0.3 ? since / 0.3 : 1;
    const hop = this.state === 'return' ? Math.abs(Math.sin(this.t * 10)) * S * 0.3 : Math.abs(Math.sin(this.t * 3)) * S * 0.05;
    ctx.save();
    ctx.translate(0, -hop);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y + S * 0.9, S * 0.6, S * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(x - S * 0.6, y + S * 0.9, S * 1.2, S * 0.18);
    const a = lerp(-1.9, 0.6, since < 0.3 ? swing : 0) + (since >= 0.3 ? -0.9 : 0);
    const hx = x + S * 0.55 + Math.cos(a) * S * 0.5;
    const hy = y + S * 0.65 + Math.sin(a) * S * 0.5;
    racket(ctx, { x: hx, y: hy }, { x: hx + Math.cos(a) * S * 0.9, y: hy + Math.sin(a) * S * 0.9 }, S * 0.8, COLORS.orange);
    rabbit(ctx, x, y, S * 0.7, this.t);
    // 머리띠
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = S * 0.12;
    ctx.beginPath();
    ctx.arc(x, y + S * 0.05, S * 0.66, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  // 칠 자리: 아이 색 동그라미 + 공이 다가올수록 좁아지는 타이밍 고리
  drawSpot(ctx) {
    const { x, y } = this.spot;
    const b = this.ball;
    const r = this.ballR * 1.8;
    const k = clamp(b.k, 0, 1);
    const color = this.targetId !== null && this.people.length >= 2 ? this.colors.get(this.targetId) ?? COLORS.yellow : COLORS.yellow;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.15 * Math.abs(Math.sin(this.t * 4));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.12;
    ctx.setLineDash([r * 0.3, r * 0.22]);
    ctx.lineDashOffset = -this.t * r * 2;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + (1 - k) * 1.2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawBall(ctx) {
    const b = this.ball;
    const r = this.ballR * b.scale;
    ctx.save();
    ctx.globalAlpha = b.alpha ?? 1;
    if (b.shadowY !== undefined) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.shadowY, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    tennisBall(ctx, b.x, b.y, r, b.spin);
    ctx.restore();
  }
}

// 테니스공: 연두색에 하얀 곡선
export function tennisBall(ctx, x, y, r, spin = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#D7F24A';
  ctx.strokeStyle = '#A9C42B';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(spin);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath();
  ctx.arc(-r * 1.15, 0, r * 0.85, -0.8, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 1.15, 0, r * 0.85, Math.PI - 0.8, Math.PI + 0.8);
  ctx.stroke();
  ctx.restore();
}

// 라켓: 손(hand)에서 머리 가운데(head)까지. 손잡이는 아이 색, 둥근 머리에 줄
export function racket(ctx, hand, head, sw, color = COLORS.blue) {
  const dx = head.x - hand.x;
  const dy = head.y - hand.y;
  const len = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx);
  const hr = sw * HEAD_R;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(a);
  ctx.lineCap = 'round';
  // 손잡이·목
  ctx.strokeStyle = color;
  ctx.lineWidth = sw * 0.12;
  ctx.beginPath();
  ctx.moveTo(-sw * 0.1, 0);
  ctx.lineTo(len * 0.35, 0);
  ctx.stroke();
  ctx.strokeStyle = '#8C99AA';
  ctx.lineWidth = sw * 0.07;
  ctx.beginPath();
  ctx.moveTo(len * 0.35, 0);
  ctx.lineTo(len - hr * 0.95, 0);
  ctx.stroke();
  // 머리
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(len, 0, hr * 1.1, hr * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(1, sw * 0.015);
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    ctx.moveTo(len + (i * hr) / 4.5, -hr);
    ctx.lineTo(len + (i * hr) / 4.5, hr);
    ctx.moveTo(len - hr * 1.2, (i * hr) / 4.5);
    ctx.lineTo(len + hr * 1.2, (i * hr) / 4.5);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = sw * 0.08;
  ctx.beginPath();
  ctx.ellipse(len, 0, hr * 1.1, hr * 0.85, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 놀이 설명: 토끼가 넘긴 공이 통 튀어 오면 친구가 라켓을 휙 휘둘러 넘긴다.
export const guide = {
  text: '공이 통 튀어서 동그라미로 오면 라켓을 휙! 휘둘러 넘겨요. 나이스 샷!',
  demo: (ctx, s, t) => {
    const period = 3.4;
    const p = t % period;
    // 코트
    ctx.fillStyle = 'rgba(70,150,200,0.5)';
    ctx.beginPath();
    ctx.moveTo(-s * 1.5, -s * 2.2);
    ctx.lineTo(s * 1.5, -s * 2.2);
    ctx.lineTo(s * 4.5, s * 2.6);
    ctx.lineTo(-s * 4.5, s * 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,40,50,0.3)';
    ctx.fillRect(-s * 2.3, -s * 1.3, s * 4.6, s * 0.4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-s * 2.3, -s * 1.35, s * 4.6, s * 0.08);
    rabbit(ctx, 0, -s * 2.6, s * 0.45, t);
    // 친구(가운데 아래), 오른손에 라켓: 1.1~1.4초에 휙
    const kx = -s * 0.4;
    const ky = s * 1.0;
    const sw = clamp((p - 1.1) / 0.3, 0, 1);
    const hand = [lerp(1.3, 0.2, sw), lerp(0.1, -0.6, sw)];
    kid(ctx, kx, ky, s * 0.9, { hands: [[-0.7, 0.3], hand], front: true, color: COLORS.blue });
    const hx = kx + hand[0] * s * 0.9;
    const hy = ky + hand[1] * s * 0.9;
    const ang = lerp(0.3, -1.6, sw);
    racket(ctx, { x: hx, y: hy }, { x: hx + Math.cos(ang) * s * 1.1, y: hy + Math.sin(ang) * s * 1.1 }, s, COLORS.blue);
    // 공: 0~1.25초 다가옴(0.7초에 통), 그 뒤 넘어감
    const spot = { x: kx + s * 1.9, y: ky - s * 0.2 };
    let bx;
    let by;
    let r;
    if (p < 1.25) {
      const k = p / 1.25;
      bx = lerp(s * 0.3, spot.x, k);
      by = k < 0.56 ? lerp(-s * 2.4, s * 0.9, k / 0.56) - Math.sin(Math.PI * k / 0.56) * s * 1.2 : lerp(s * 0.9, spot.y, (k - 0.56) / 0.44);
      r = s * lerp(0.12, 0.3, k);
    } else {
      const k = Math.min(1, (p - 1.25) / 0.8);
      bx = lerp(spot.x, s * 0.6, k);
      by = lerp(spot.y, -s * 2.3, k) - Math.sin(Math.PI * k) * s * 1.5;
      r = s * lerp(0.3, 0.12, k);
    }
    tennisBall(ctx, bx, by, r, p * 8);
    if (p > 1.25 && p < 2.0) {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + p * 3;
        star(ctx, spot.x + Math.cos(a) * s * 0.6, spot.y + Math.sin(a) * s * 0.6, s * 0.14, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// 메뉴 아이콘: 라켓과 통통 튀는 테니스공
export function menuIcon(ctx, r, t = 0) {
  racket(ctx, { x: -r * 0.55, y: r * 0.55 }, { x: -r * 0.05, y: -r * 0.05 }, r * 0.7, COLORS.blue);
  const hop = Math.abs(Math.sin(t * 3)) * r * 0.3;
  tennisBall(ctx, r * 0.45, r * 0.25 - hop, r * 0.2, t * 3);
}
