import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { rabbit } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { drawAvatar, P, shoulders, visible } from '../engine/pose.js';
import { touches } from '../engine/hit.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';
import { miniGoal, soccerBall } from './SoccerScene.js';

const GOAL = 10; // 한 단계에서 막을 공 수(별)
// 단계별 난이도(거리는 모두 어깨너비 sw 배라 아이 키·거리와 무관):
// travel = 토끼 발에서 막을 자리까지 공이 날아오는 시간(초), reach = 몸 가운데에서 옆으로 떨어진 거리 범위,
// heights = 막을 자리 높이(어깨선 기준, 음수 = 위), ringEarly = 공을 차기 전부터 막을 자리 동그라미를 보여 줄지
const LEVELS = [
  { travel: 2.6, reach: [1.3, 1.8], heights: [0.2, 0.5], ringEarly: true },
  { travel: 2.1, reach: [1.5, 2.2], heights: [-0.9, 0.3, 1.2], ringEarly: true },
  { travel: 1.7, reach: [1.7, 2.6], heights: [-1.2, -0.5, 0.4, 1.4], ringEarly: false },
];
const WINDUP = 1.1; // 토끼가 통통 뛰며 찰 준비를 하는 시간(초)
const REST = 0.9; // 다음 공까지 쉬는 시간(초)
const FAR_SCALE = 0.22; // 토끼 발밑(멀리)에서 공 크기 배율 — 날아오며 점점 커진다
const CATCH_FROM = 0.6; // 공이 이만큼(0~1) 날아오면 손을 대서 막을 수 있다(그 전엔 너무 멀다)
const BODY_FROM = 0.9; // 몸(머리·어깨·팔꿈치)으로 막기는 공이 이만큼 왔을 때부터
const PASS_TIME = 0.35; // 막을 자리를 지난 뒤에도 이 시간(초) 동안은 막을 수 있다(조금 늦어도 인정)
const NET_TIME = 1.3; // 못 막은 공이 그물에 들어가 출렁이는 시간(초)
const CAUGHT_TIME = 1.3; // 막은 뒤 다음 공까지(초)
const HAND_R = 0.45; // 손 판정 반지름(어깨너비 배, 넉넉하게)
const BODY_R = 0.25; // 머리·어깨·팔꿈치로 막을 때 판정 반지름(어깨너비 배)
const BALL_R = 0.42; // 막을 자리에 온 공 반지름(어깨너비 배) — 아이가 멀리 서도 공 크기가 몸에 맞게
const ASSIST_AFTER = 2; // 연달아 이만큼 못 막으면 다음 공을 느리고 가깝게(도움)
const ASSIST_SLOW = 1.3;
const SAVE_VOICES = ['막았다!', '잡았다! 멋져요!', '슈퍼 세이브!', '최고의 골키퍼!'];
const BODY_VOICES = ['몸으로 막았다!', '와, 몸으로 막았어요!'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const between = ([a, b]) => a + Math.random() * (b - a);

// 골키퍼 놀이: 아이가 골대 앞 골키퍼! 멀리 있는 토끼 친구가 공을 뻥 차면
// 공이 점점 커지며 날아오고, 노란 동그라미(막을 자리)에 손(장갑)을 대서 막는다.
// 몸·머리로 막아도 인정, 못 막아도 벌점 없이 "아깝다!". 두 명이면 공이 번갈아 한 아이씩 찾아간다.
export class KeeperScene {
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
    // 위쪽 별 게이지·단계 표시 아래, 놀이 영역 위쪽 가운데에 토끼(멀리 있는 공격수)를 둔다.
    this.farS = unit * 0.035;
    this.fx = z.x + z.w / 2;
    this.fy = Math.max(z.y + z.h * 0.1, h * 0.055 + unit * 0.035 * 6.4) + this.farS * 1.6;
    this.ballR ??= unit * 0.06;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.stateT = 0;
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.colors = new Map();
    this.people = [];
    this.targetId = null;
    this.lastTargetId = null;
    this.lastSide = 0;
    this.sideRun = 0;
    this.missStreak = 0;
    this.netShake = 0;
    this.netHit = null;
    this.caught = null;
    this.ball = { x: this.fx, y: this.fy, scale: FAR_SCALE, rot: 0, alpha: 1 };
    this.spot = null;
    this.after(speak('나는 골키퍼! 토끼가 찬 공이 날아오면 노란 동그라미에 손을 대서 막아요!'), () => this.rest(0.3));
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

  get assisted() {
    return this.missStreak >= ASSIST_AFTER;
  }

  colorOf(id) {
    if (!this.colors.has(id)) {
      const present = new Set(this.people.filter((p) => p.id !== id).map((p) => this.colors.get(p.id)));
      this.colors.set(id, PLAYER_COLORS.find((c) => !present.has(c)) ?? PLAYER_COLORS[0]);
    }
    return this.colors.get(id);
  }

  // 보호자·PC 테스트용: 날아오는 공을 터치하면 막기
  onTap(x, y) {
    if (!this.catchable) return;
    const b = this.ball;
    if (Math.hypot(x - b.x, y - b.y) < this.ballR * b.scale * 2) this.save('hand');
  }

  get catchable() {
    return (this.state === 'fly' && this.flyK >= CATCH_FROM) || this.state === 'pass';
  }

  // ---------------- 진행 ----------------

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.netShake = Math.max(0, this.netShake - dt * 1.4);
    this.people = input.people;
    for (const p of this.people) this.colorOf(p.id);

    const b = this.ball;
    switch (this.state) {
      case 'rest':
        this.stateT -= dt;
        if (this.stateT <= 0) this.windup();
        break;
      case 'windup':
        this.stateT -= dt;
        b.x = this.fx + this.farS * 0.9;
        b.y = this.fy + this.farS * 1.0;
        b.scale = FAR_SCALE;
        b.alpha = 1;
        if (this.stateT <= 0) this.shoot();
        break;
      case 'fly': {
        const f = this.fly;
        f.t += dt;
        const k = Math.min(1, f.t / f.travel);
        this.flyK = k;
        // 다가오는 공은 처음엔 천천히, 가까워질수록 빨리 커져 보인다.
        const e = k * 0.55 + k * k * 0.45;
        b.x = lerp(f.x0, f.x1, e);
        b.y = lerp(f.y0, f.y1, e) - Math.sin(Math.PI * e) * f.arc;
        b.scale = lerp(FAR_SCALE, 1, e * e);
        b.rot += dt * 10;
        if (k >= 1) {
          this.state = 'pass';
          this.stateT = 0;
        }
        break;
      }
      case 'pass': {
        // 막을 자리를 지나 조금 더 다가온다(아직 막을 수 있음).
        const f = this.fly;
        this.stateT += dt;
        const k = this.stateT / PASS_TIME;
        b.x = f.x1 + (f.x1 - f.x0) * 0.08 * k;
        b.y = f.y1 + (f.y1 - f.y0) * 0.08 * k;
        b.scale = 1 + 0.12 * k;
        b.rot += dt * 10;
        if (k >= 1) this.missed();
        break;
      }
      case 'net':
        // 아이 뒤 그물로 쏙 들어간다.
        this.stateT -= dt;
        b.scale = Math.max(0.55, b.scale - dt * 1.2);
        b.alpha = clamp(this.stateT / 0.5, 0, 1);
        b.rot += dt * 4;
        if (this.stateT <= 0) this.rest(REST);
        break;
      case 'caught':
        this.stateT -= dt;
        if (this.caught) {
          // 막은 공은 장갑에 꼭 붙어 있다가 반짝이며 사라진다.
          const hand = this.caughtPoint();
          if (hand) {
            b.x += (hand.x - b.x) * Math.min(1, dt * 12);
            b.y += (hand.y - b.y) * Math.min(1, dt * 12);
          }
        }
        b.alpha = clamp(this.stateT / 0.4, 0, 1);
        if (this.stateT <= 0) {
          if (this.score >= GOAL) this.celebrate();
          else this.rest(REST * 0.6);
        }
        break;
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

    if (this.catchable) this.checkSave(input);
  }

  rest(time) {
    this.state = 'rest';
    this.stateT = time;
    this.spot = null;
  }

  // 토끼가 통통 뛰며 찰 준비. 이번 차례 아이와 막을 자리를 정한다.
  windup() {
    this.state = 'windup';
    this.stateT = WINDUP;
    const people = this.people.filter((p) => !p.lost && shoulders(p.pose));
    let target = people[0] ?? null;
    if (people.length >= 2) target = people.find((p) => p.id !== this.lastTargetId) ?? people[0];
    this.targetId = target?.id ?? null;
    if (target) this.lastTargetId = target.id;
    this.spot = this.pickSpot(target);
    sfx.peek();
  }

  // 막을 자리: 아이 몸 가운데에서 왼쪽·오른쪽으로 손을 뻗으면 닿는 곳. 같은 쪽이 세 번 연달아 나오지 않게.
  pickSpot(person) {
    const { zone: z, unit, homeButton: hb } = this.game;
    const sh = person ? shoulders(person.pose) : null;
    const mx = sh ? sh.mx : z.x + z.w / 2;
    const my = sh ? sh.my : z.y + z.h * 0.45;
    const sw = sh ? sh.sw : unit * 0.12;
    const cfg = this.assisted ? LEVELS[0] : this.cfg;
    let side = Math.random() < 0.5 ? -1 : 1;
    if (this.sideRun >= 2 && side === this.lastSide) side = -side;
    this.sideRun = side === this.lastSide ? this.sideRun + 1 : 1;
    this.lastSide = side;
    const r0 = clamp(sw * BALL_R, unit * 0.04, unit * 0.08);
    this.ballR = r0;
    const r = r0 * 1.3;
    let x = mx + side * between(cfg.reach) * sw;
    const y = clamp(my + pick(cfg.heights) * sw, this.fy + this.farS * 2 + r, z.y + z.h - r);
    // 화면 밖으로 나가면 반대쪽으로
    if (x < z.x + r || x > z.x + z.w - r) x = mx - (x - mx);
    x = clamp(x, z.x + r, z.x + z.w - r);
    // 집 버튼과 겹치면 오른쪽으로 비켜 둔다.
    if (hb && Math.hypot(x - hb.x, y - hb.y) < hb.r + r) x = hb.x + hb.r + r;
    return { x, y, sw };
  }

  shoot() {
    const assisted = this.assisted;
    const s = this.spot;
    const b = this.ball;
    const travel = this.cfg.travel * (assisted ? ASSIST_SLOW : 1);
    this.fly = { x0: b.x, y0: b.y, x1: s.x, y1: s.y, t: 0, travel, arc: this.game.unit * (0.04 + Math.random() * 0.08) };
    this.flyK = 0;
    this.state = 'fly';
    this.kickT = this.t;
    sfx.bonk();
    sfx.whoosh();
  }

  // 손(손목·검지, 터치 포함)이나 머리·어깨·팔꿈치가 공에 닿으면 막은 것
  checkSave(input) {
    const b = this.ball;
    const sw = this.spot?.sw ?? this.game.unit * 0.12;
    const r = this.ballR * b.scale;
    for (const p of input.pointers) {
      if (!p.key.startsWith('p') && p.key !== 'mouse') continue;
      if (touches(p, b.x, b.y, r + HAND_R * sw)) {
        this.caught = { key: p.key };
        return this.save('hand');
      }
    }
    // 몸으로 막기는 공이 막을 자리에 거의 왔을 때만(날아오는 길이 화면에서 어깨 위를 지나가기 때문)
    if (this.state === 'fly' && this.flyK < BODY_FROM) return;
    for (const person of this.people) {
      if (person.lost) continue;
      const psh = shoulders(person.pose);
      const psw = psh?.sw ?? sw;
      for (const i of [P.nose, P.lShoulder, P.rShoulder, P.lElbow, P.rElbow]) {
        const q = person.pose[i];
        if (visible(q, 0.4) && Math.hypot(q.x - b.x, q.y - b.y) < r + BODY_R * psw) {
          this.caught = null;
          return this.save('body');
        }
      }
    }
  }

  // 공을 막은 손의 지금 위치(공이 장갑을 따라가게)
  caughtPoint() {
    const key = this.caught?.key;
    if (!key) return null;
    if (key === 'mouse') return this.game.mouse;
    const m = key.match(/^p(\d+)-(\w+)$/);
    if (!m) return null;
    const person = this.people.find((p) => String(p.id) === m[1]);
    const idx = { lw: P.lWrist, rw: P.rWrist, li: P.lIndex, ri: P.rIndex }[m[2]];
    const q = person?.pose[idx];
    return q && visible(q, 0.3) ? q : null;
  }

  save(kind) {
    const b = this.ball;
    this.state = 'caught';
    this.stateT = CAUGHT_TIME;
    this.missStreak = 0;
    sfx.success();
    sfx.sparkle(0.1);
    const { particles, unit } = this.game;
    particles.burst(b.x, b.y, { count: 26, colors: RAINBOW, speed: unit * 0.5, size: unit * 0.016, shape: 'star', gravity: 200 });
    particles.ring(b.x, b.y, { color: '#fff', size: unit * 0.07 });
    speak(pick(kind === 'body' ? BODY_VOICES : SAVE_VOICES));
    this.pulse[this.score] = 1;
    this.score++;
  }

  // 못 막아도 벌점은 없다. 공이 아이 뒤 그물로 들어가고 다시 해 본다.
  missed() {
    const b = this.ball;
    this.state = 'net';
    this.stateT = NET_TIME;
    this.netShake = 1;
    this.netHit = { x: b.x, y: b.y };
    this.missStreak++;
    sfx.boing();
    if (this.missStreak === ASSIST_AFTER) speak('괜찮아요! 동그라미에 손을 미리 대고 기다려 봐요!');
    else if (this.missStreak % 2 === 1) speak('아깝다! 다시 막아 봐요!');
  }

  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    this.spot = null;
    sfx.fanfare();
    sfx.whistle();
    speak(
      last
        ? '3단계까지 모두 막았어요! 최고의 골키퍼예요!'
        : this.level === 1
          ? '골키퍼 대장! 2단계! 이제 위로, 아래로도 날아와요!'
          : '대단해요! 3단계! 공이 더 빨리 와요!',
    );
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    this.level = this.level >= LEVELS.length ? 1 : this.level + 1;
    this.missStreak = 0;
    this.rest(0.5);
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    this.drawField(ctx);

    // 이번 차례 아이 발밑 표시는 막을 자리 동그라미로 대신하고, 아바타 + 골키퍼 장갑을 그린다.
    for (const p of this.people) drawAvatar(ctx, p.pose, this.colorOf(p.id));
    for (const p of this.people) this.drawGloves(ctx, p);

    this.drawStriker(ctx);
    if (this.spot && this.showRing) this.drawSpot(ctx);
    if (['windup', 'fly', 'pass', 'net', 'caught'].includes(this.state)) this.drawBall(ctx);
    if (this.state === 'intro') {
      const { unit } = this.game;
      star(ctx, this.fx, this.fy - this.farS * 2.6 + Math.sin(this.t * 4) * unit * 0.01, unit * 0.03, COLORS.yellow, '#fff');
    }

    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  get showRing() {
    if (this.state === 'windup') return this.cfg.ringEarly || this.assisted;
    return this.state === 'fly' || this.state === 'pass';
  }

  // 잔디 + 아이 뒤의 커다란 골대(그물이 비쳐 보이게 반투명). 못 막으면 그물이 출렁인다.
  drawField(ctx) {
    const { zone: z, unit } = this.game;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    const ground = z.y + z.h * 0.78;
    ctx.fillStyle = 'rgba(126,206,98,0.5)';
    ctx.fillRect(z.x, ground, z.w, z.y + z.h - ground);
    // 그물
    const L = z.x + z.w * 0.04;
    const R = z.x + z.w * 0.96;
    const top = z.y + z.h * 0.06;
    const hit = this.netHit ?? { x: (L + R) / 2, y: (top + ground) / 2 };
    const amp = this.netShake * Math.cos(this.netShake * 28) * unit * 0.05;
    const RR = (R - L) * 0.18;
    const cols = 16;
    const rows = 9;
    const pt = (i, j) => {
      const x = L + ((R - L) * i) / cols;
      const y = top + ((ground - top) * j) / rows;
      const f = Math.exp(-((x - hit.x) ** 2 + (y - hit.y) ** 2) / (RR * RR));
      const edge = i === 0 || i === cols || j === 0 || j === rows ? 0 : 1;
      return [x, y - amp * f * edge];
    };
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(L, top, R - L, ground - top);
    ctx.strokeStyle = 'rgba(120,120,130,0.35)';
    ctx.lineWidth = Math.max(1, unit * 0.003);
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) (j ? ctx.lineTo : ctx.moveTo).call(ctx, ...pt(i, j));
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...pt(i, j));
    ctx.stroke();
    // 골대 기둥
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(L, ground);
      ctx.lineTo(L, top);
      ctx.lineTo(R, top);
      ctx.lineTo(R, ground);
    };
    path();
    ctx.strokeStyle = 'rgba(61,44,46,0.3)';
    ctx.lineWidth = unit * 0.026;
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = unit * 0.018;
    ctx.stroke();
    ctx.restore();
  }

  // 멀리 있는 토끼 공격수: 찰 준비 때 통통, 찬 직후 다리를 뻗는다. 막으면 박수, 골인이면 폴짝.
  drawStriker(ctx) {
    const s = this.farS;
    const { fx, fy } = this;
    let hop = Math.abs(Math.sin(this.t * 2)) * s * 0.1;
    if (this.state === 'windup') hop = Math.abs(Math.sin(this.t * 9)) * s * 0.4;
    if (this.state === 'net') hop = Math.abs(Math.sin(this.t * 12)) * s * 0.5;
    ctx.save();
    // 작은 잔디 언덕
    ctx.fillStyle = 'rgba(104,190,84,0.75)';
    ctx.beginPath();
    ctx.ellipse(fx, fy + s * 1.15, s * 2.6, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const kicking = this.t - (this.kickT ?? -9) < 0.35;
    if (kicking) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s * 0.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx + s * 0.3, fy + s * 0.7);
      ctx.lineTo(fx + s * 1.1, fy + s * 0.55);
      ctx.stroke();
    }
    rabbit(ctx, fx, fy - hop, s, this.t);
    ctx.restore();
  }

  // 막을 자리: 노란 점선 동그라미 + 장갑 그림. 공이 다가올수록 동그라미가 공 크기로 좁혀진다(타이밍 고리).
  drawSpot(ctx) {
    const { x, y } = this.spot;
    const r = this.ballR * 1.15;
    const k = this.state === 'fly' ? this.flyK : this.state === 'pass' ? 1 : 0;
    const ring = r * (1 + (1 - k) * 0.9);
    const color = this.targetId !== null && this.people.length >= 2 ? this.colors.get(this.targetId) ?? COLORS.yellow : COLORS.yellow;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.15 * Math.abs(Math.sin(this.t * 4));
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = this.ballR * 0.14;
    ctx.setLineDash([this.ballR * 0.3, this.ballR * 0.22]);
    ctx.lineDashOffset = -this.t * this.ballR * 2;
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.5;
    glove(ctx, x, y, r * 0.55, x < this.game.w / 2 ? -1 : 1);
    ctx.restore();
  }

  drawGloves(ctx, person) {
    const sh = shoulders(person.pose);
    if (!sh) return;
    for (const w of [P.lWrist, P.rWrist]) {
      const q = person.pose[w];
      if (!visible(q, 0.3)) continue;
      glove(ctx, q.x, q.y, sh.sw * 0.3, q.x < sh.mx ? -1 : 1); // 엄지가 몸 쪽으로
    }
  }

  drawBall(ctx) {
    const b = this.ball;
    const r = this.ballR * b.scale;
    ctx.save();
    ctx.globalAlpha = b.alpha ?? 1;
    soccerBall(ctx, b.x, b.y, r, b.rot);
    ctx.restore();
  }
}

// 골키퍼 장갑: 노란 손바닥 + 손가락 네 개 + 엄지. side = -1(화면 왼쪽 손) | 1(오른쪽 손)
export function glove(ctx, x, y, s, side = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(side, 1);
  ctx.fillStyle = COLORS.yellow;
  ctx.strokeStyle = '#E0A800';
  ctx.lineWidth = s * 0.12;
  ctx.lineJoin = 'round';
  // 손가락
  for (let i = 0; i < 4; i++) {
    const fx = -s * 0.45 + i * s * 0.3;
    ctx.beginPath();
    ctx.roundRect(fx - s * 0.13, -s * 1.05, s * 0.26, s * 0.75, s * 0.13);
    ctx.fill();
    ctx.stroke();
  }
  // 엄지
  ctx.beginPath();
  ctx.ellipse(-s * 0.75, s * 0.05, s * 0.18, s * 0.38, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 손바닥
  ctx.beginPath();
  ctx.roundRect(-s * 0.6, -s * 0.5, s * 1.2, s * 1.0, s * 0.35);
  ctx.fill();
  ctx.stroke();
  // 손목 띠
  ctx.fillStyle = COLORS.blue;
  ctx.beginPath();
  ctx.roundRect(-s * 0.55, s * 0.4, s * 1.1, s * 0.35, s * 0.12);
  ctx.fill();
  ctx.restore();
}

// 놀이 설명: 골대 앞 친구에게 공이 날아오고, 장갑 낀 손을 뻗어 막는다.
export const guide = {
  text: '나는 골키퍼! 공이 날아오면 노란 동그라미에 손을 대서 막아요. 막았다!',
  demo: (ctx, s, t) => {
    const period = 3.2;
    const p = t % period;
    ctx.fillStyle = 'rgba(126,206,98,0.55)';
    ctx.fillRect(-s * 8, s * 2.2, s * 16, s * 4);
    miniGoal(ctx, 0, s * 2.4, s * 6.4, s * 4.4);
    const kx = 0;
    const ky = s * 0.85;
    const spot = [s * 1.75, -s * 0.75]; // 친구 오른손을 뻗으면 닿는 곳(카드 좌표)
    const reach = clamp((p - 0.5) / 0.7, 0, 1);
    const ready = [0.85, -0.2];
    const hand = [lerp(ready[0], (spot[0] - kx) / s, reach), lerp(ready[1], (spot[1] - ky) / s, reach)];
    if (p < 0.9) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.abs(Math.sin(p * 8));
      ctx.fillStyle = COLORS.yellow;
      ctx.beginPath();
      ctx.arc(spot[0], spot[1], s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    kid(ctx, kx, ky, s, { hands: [[-0.85, -0.2], hand], front: true });
    glove(ctx, kx - 0.85 * s, ky - 0.2 * s, s * 0.22, -1);
    glove(ctx, kx + hand[0] * s, ky + hand[1] * s, s * 0.22, 1);
    // 공: 0.2~1.4초 멀리서 커지며 날아와 손에 쏙
    const from = [-s * 0.3, -s * 3.3];
    if (p > 0.2 && p < 1.4) {
      const k = (p - 0.2) / 1.2;
      const e = k * 0.55 + k * k * 0.45;
      soccerBall(ctx, lerp(from[0], spot[0], e), lerp(from[1], spot[1], e) - Math.sin(Math.PI * e) * s * 0.5, s * lerp(0.12, 0.42, e * e), k * 8);
    } else if (p >= 1.4 && p < 2.6) {
      soccerBall(ctx, spot[0], spot[1], s * 0.42, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + p * 2;
        star(ctx, spot[0] + Math.cos(a) * s * 0.85, spot[1] + Math.sin(a) * s * 0.85, s * 0.18, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// 메뉴 아이콘: 장갑이 축구공을 막는 모습
export function menuIcon(ctx, r, t = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(126,206,98,0.7)';
  ctx.fillRect(-r, r * 0.35, r * 2, r);
  ctx.restore();
  miniGoal(ctx, 0, r * 0.4, r * 1.4, r * 0.9);
  const k = (Math.sin(t * 3) + 1) / 2;
  soccerBall(ctx, r * 0.18, -r * 0.18 - k * r * 0.06, r * 0.26, t * 2);
  glove(ctx, -r * 0.18, r * 0.12, r * 0.28, -1);
}
