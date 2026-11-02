import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { bear, cat, dog, rabbit } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { drawAvatar, P, perPerson, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';
import { baseball, bat, mitt, turnMarker } from './BaseballScene.js';

// 단계: 1 = 포수 미트에 스트라이크, 2 = 판 9개 맞혀 쓰러뜨리기, 3 = 토끼·강아지·고양이 타자 삼진 잡기
const GOALS = [8, 9, 9]; // 단계마다 모을 별 수(3단계는 타자 3명 × 스트라이크 3개)
const LEVEL_COUNT = GOALS.length;

// ---- 던지기 판정(모두 어깨너비 sw 배라 아이 키·거리와 무관) — 실제 아이와 해 보며 조정할 추정값 ----
const COCK_LINE = 0.15; // 손목이 어깨선보다 이만큼 아래까지 올라오면 '공을 든 손을 들었다'
const COCK_KEEP = 0.8; // 손을 든 뒤 이 시간(초) 안에 휙 내려야 던지기
const SPEED_WINDOW = 0.15; // 이 시간(초) 동안 움직인 거리로 빠르기를 잰다
const THROW_SPEED = 2.6; // 이 빠르기(sw/초) 이상으로 손이 앞(아래)으로 나가면 던진 것
const THROW_MOVE = 0.4; // 그동안 적어도 이만큼은 움직여야
const RELEASE_TIME = 0.1; // 던지기 시작 뒤 이 시간 동안 가장 빠른 순간을 잰다(공 빠르기)
const MAX_SPEED = 9; // 이 빠르기면 가장 빠른 공(별 3개)
const FAST_SPEED = 4.8; // 3단계: 이 빠르기 이상이면 타자가 헛스윙(못 치면 기준을 조금씩 낮춘다)
const FAST_EASE = 0.85; // 3단계에서 파울이 날 때마다 기준을 이만큼 곱해 낮춘다
const THROW_COOLDOWN = 0.6; // 공이 손에 돌아온 뒤 이 시간(초)은 던지기를 받지 않는다(손 내리는 동작 무시)
const IDLE_VOICE_AFTER = 8; // 이만큼(초) 안 던지면 방법을 다시 알려 준다
const IDLE_VOICE_GAP = 12;
const STRIKE_VOICES = ['스트라이크!', '쏙! 스트라이크!', '나이스 피칭!'];
const PANEL_VOICES = ['쾅! 맞았다!', '명중!', '판이 쓰러졌어요!'];
const BATTERS = [rabbit, dog, cat];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// 야구 투수 놀이: 아이가 투수! 공을 든 손을 머리 위로 들었다가 앞으로 휙! 던지면
// 멀리 홈 플레이트로 공이 날아간다. 두 명이면 한 번씩 번갈아 던진다(차례인 아이 머리 위 표시).
export class PitcherScene {
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
    this.S = unit * 0.05; // 멀리 있는 친구·판 크기 단위
    this.tx = z.x + z.w / 2;
    // 위쪽 별 게이지·단계 표시 아래에 스트라이크 존(미트·판 가운데)을 둔다.
    this.ty = Math.max(z.y + z.h * 0.3, h * 0.055 + unit * 0.035 * 6.4 + this.S * 2.2);
    this.plateY = this.ty + this.S * 2.1;
    this.panelS = this.S * 0.95;
    this.panelGap = this.panelS * 1.18;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.t = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.states = new Map();
    this.colors = new Map();
    this.people = [];
    this.turnId = null;
    this.lastThrowerId = null;
    this.resetLevel();
    this.after(speak('나는 투수! 공을 든 손을 머리 위로 들었다가 앞으로 휙! 던져요!'), () => this.ready());
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

  get goal() {
    return GOALS[this.level - 1];
  }

  resetLevel() {
    this.score = 0;
    this.pulse = new Array(Math.max(...GOALS)).fill(0);
    this.panels = Array.from({ length: 9 }, (_, i) => ({ i, col: (i % 3) - 1, row: Math.floor(i / 3) - 1, down: 0, falling: false }));
    this.batterIdx = 0;
    this.batterStrikes = 0;
    this.fastNeed = FAST_SPEED;
    this.swing = null;
    this.mittSquash = 0;
    this.ball = null;
  }

  colorOf(id) {
    if (!this.colors.has(id)) {
      const present = new Set(this.people.filter((p) => p.id !== id).map((p) => this.colors.get(p.id)));
      this.colors.set(id, PLAYER_COLORS.find((c) => !present.has(c)) ?? PLAYER_COLORS[0]);
    }
    return this.colors.get(id);
  }

  ready() {
    this.state = 'ready';
    this.readyT = 0;
    this.lastIdleVoice = this.game.time;
    // 두 명이면 차례를 번갈아
    const people = this.people.filter((p) => !p.lost);
    this.turnId = people.length >= 2 ? (people.find((p) => p.id !== this.lastThrowerId) ?? people[0]).id : null;
    for (const s of this.states.values()) s.pending = null;
  }

  // 보호자·PC 테스트용: 화면을 누르면 그쪽으로 꽤 빠른 공
  onTap(x, y) {
    if (this.state !== 'ready') return;
    const { zone: z } = this.game;
    this.throwBall({ x: this.tx + (x - this.tx) * 0.4, y: z.y + z.h * 0.85 }, 6.5, clamp((x - this.tx) / (this.panelGap * 1.5), -1, 1), null);
  }

  // ---------------- 진행 ----------------

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < this.pulse.length; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.mittSquash = Math.max(0, this.mittSquash - dt * 3);
    for (const p of this.panels) if (p.falling) p.down = Math.min(1, p.down + dt * 4);
    this.people = input.people;
    for (const p of this.people) this.colorOf(p.id);
    if (this.turnId !== null && !this.people.some((p) => p.id === this.turnId && !p.lost)) this.turnId = null;

    this.sense();

    switch (this.state) {
      case 'ready':
        this.readyT += dt;
        if (this.readyT > IDLE_VOICE_AFTER && this.game.time - this.lastIdleVoice > IDLE_VOICE_GAP) {
          this.lastIdleVoice = this.game.time;
          speak('공을 든 손을 머리 위로 번쩍! 들었다가 앞으로 휙! 던져요!');
        }
        break;
      case 'fly':
        this.updateFly(dt);
        break;
      case 'foul': {
        // 타자가 친 공은 높이 떠서 옆으로 날아간다.
        const b = this.ball;
        b.t += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy += this.game.unit * 1.2 * dt;
        b.r *= 1 + dt * 0.4;
        b.spin += dt * 20;
        this.stateT -= dt;
        if (this.stateT <= 0) this.afterResult();
        break;
      }
      case 'result':
        this.stateT -= dt;
        if (this.stateT <= 0) this.afterResult();
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
  }

  // 손목 움직임으로 '던졌다'를 찾는다. 차례인 아이(혼자면 누구든)만.
  sense() {
    const now = this.game.time;
    for (const p of perPerson(this.states, this.people)) {
      const s = p.state;
      if (p.lost || p.pose === s.lastPose) continue;
      s.lastPose = p.pose;
      const sh = shoulders(p.pose);
      if (!sh) continue;
      const sw = sh.sw;
      const mine = this.turnId === null || this.turnId === p.id;
      for (const side of ['l', 'r']) {
        const w = p.pose[side === 'l' ? P.lWrist : P.rWrist];
        const hist = (s[side] ??= { pts: [], cockT: -Infinity });
        if (!visible(w, 0.35)) {
          hist.pts.length = 0;
          continue;
        }
        hist.pts.push({ x: w.x, y: w.y, t: now });
        while (hist.pts.length > 2 && now - hist.pts[0].t > SPEED_WINDOW) hist.pts.shift();
        if (w.y < sh.my + COCK_LINE * sw) hist.cockT = now;
        const a = hist.pts[0];
        const span = now - a.t;
        const dx = w.x - a.x;
        const dy = w.y - a.y;
        const d = Math.hypot(dx, dy);
        const speed = span >= 0.03 && span <= SPEED_WINDOW * 2 ? d / span / sw : 0;

        // 던지는 중: 가장 빠른 순간을 잠깐 더 재고 공을 놓는다.
        const pend = s.pending;
        if (pend && pend.side === side) {
          pend.speed = Math.max(pend.speed, speed);
          pend.end = { x: w.x, y: w.y };
          if (now - pend.t >= RELEASE_TIME) {
            s.pending = null;
            if (this.state === 'ready') {
              const aim = clamp((pend.end.x - sh.mx) / (sw * 1.2) + (pend.end.x - pend.start.x) / (sw * 2.5), -1.4, 1.4);
              this.throwBall(pend.start, pend.speed, aim, p.id);
            }
          }
          continue;
        }
        if (!mine || this.state !== 'ready' || s.pending || this.readyT < THROW_COOLDOWN) continue;
        // 손을 들었다가(어깨 위) 휙 앞(아래)으로: 위로 올리는 동작은 빼고, 옆으로 던지기는 받아 준다.
        if (now - hist.cockT <= COCK_KEEP && d >= THROW_MOVE * sw && speed >= THROW_SPEED && dy >= -0.2 * d) {
          s.pending = { side, t: now, speed, start: { x: a.x, y: a.y }, end: { x: w.x, y: w.y } };
          hist.cockT = -Infinity;
        }
      }
    }
  }

  // 공을 던진다. speed = 손 빠르기(sw/초), aim = -1(화면 왼쪽) ~ 1(오른쪽)
  throwBall(from, speed, aim, id) {
    this.lastThrowerId = id;
    const power = clamp((speed - THROW_SPEED) / (MAX_SPEED - THROW_SPEED), 0, 1);
    const S = this.S;
    let to = { x: this.tx + (Math.random() - 0.5) * S * 0.3, y: this.ty + (Math.random() - 0.5) * S * 0.3 };
    let panel = null;
    let fast = true;
    if (this.level === 2) {
      // 던진 쪽(왼쪽·가운데·오른쪽)의 서 있는 판 중 하나. 그 줄이 다 쓰러졌으면 가장 가까운 줄.
      const standing = this.panels.filter((p) => !p.falling);
      const col = Math.round(clamp(aim, -1, 1));
      const near = standing.filter((p) => p.col === col);
      const pool = near.length ? near : standing.filter((p) => Math.abs(p.col - col) === Math.min(...standing.map((q) => Math.abs(q.col - col))));
      panel = pick(pool);
      to = this.panelPos(panel);
    } else if (this.level === 3) {
      fast = speed >= this.fastNeed;
    }
    this.ball = {
      x0: from.x,
      y0: from.y,
      x1: to.x,
      y1: to.y,
      t: 0,
      time: lerp(1.0, 0.5, power),
      arc: this.game.unit * lerp(0.1, 0.04, power),
      r0: Math.max(this.game.unit * 0.025, this.S * 0.5),
      r1: S * 0.22,
      x: from.x,
      y: from.y,
      r: S * 0.5,
      spin: 0,
      power,
      panel,
      fast,
    };
    this.state = 'fly';
    sfx.whoosh();
    if (this.level === 3) this.swing = { t: this.t + this.ball.time * (fast ? 0.92 : 0.82), hit: !fast };
  }

  updateFly(dt) {
    const b = this.ball;
    b.t += dt;
    const k = Math.min(1, b.t / b.time);
    const e = easeOut(k);
    b.x = lerp(b.x0, b.x1, e);
    b.y = lerp(b.y0, b.y1, e) - Math.sin(Math.PI * k) * b.arc;
    b.r = lerp(b.r0, b.r1, e);
    b.spin += dt * 18;
    // 3단계 느린 공: 타자가 홈 플레이트 앞에서 딱! 친다.
    if (this.level === 3 && !b.fast && k >= 0.86) return this.foul();
    if (k >= 1) this.arrive();
  }

  arrive() {
    const b = this.ball;
    const { particles, unit } = this.game;
    const stars = b.power < 0.33 ? 1 : b.power < 0.66 ? 2 : 3;
    this.speedStars = { n: stars, t: this.t, x: b.x, y: b.y };
    if (b.panel) {
      b.panel.falling = true;
      sfx.bonk();
      sfx.pop();
      particles.burst(b.x, b.y, { count: 22, colors: RAINBOW, speed: unit * 0.4, size: unit * 0.014, shape: 'star', gravity: 200 });
      speak(pick(PANEL_VOICES));
    } else {
      this.mittSquash = 1;
      sfx.bonk();
      particles.burst(b.x, b.y, { count: 18, colors: ['#fff', COLORS.yellow], speed: unit * 0.35, size: unit * 0.013, shape: 'star', gravity: 150 });
      if (this.level === 3) {
        this.batterStrikes++;
        if (this.batterStrikes >= 3) {
          sfx.whistle();
          speak('삼진 아웃!');
        } else speak('헛스윙! 스트라이크!');
      } else speak(pick(STRIKE_VOICES));
    }
    sfx.success();
    this.pulse[this.score] = 1;
    this.score++;
    this.state = 'result';
    this.stateT = 1.3;
  }

  // 3단계 느린 공은 파울(벌점 없음). 다음엔 조금 덜 세게 던져도 헛스윙하게 기준을 낮춘다.
  foul() {
    const b = this.ball;
    const { unit } = this.game;
    sfx.bonk();
    sfx.boing();
    b.vx = (Math.random() < 0.5 ? -1 : 1) * unit * 0.6;
    b.vy = -unit * 0.9;
    this.state = 'foul';
    this.stateT = 1.4;
    this.fastNeed = Math.max(THROW_SPEED * 1.15, this.fastNeed * FAST_EASE);
    speak('딱! 파울! 더 세게 휙! 던져 봐요!');
  }

  afterResult() {
    this.ball = null;
    if (this.score >= this.goal) return this.celebrate();
    if (this.level === 3 && this.batterStrikes >= 3) {
      // 다음 타자 등장
      this.batterIdx++;
      this.batterStrikes = 0;
    }
    this.ready();
  }

  celebrate() {
    const last = this.level >= LEVEL_COUNT;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3;
    this.fireT = 0;
    sfx.fanfare();
    speak(last ? '삼진 아웃 세 번! 최고의 투수예요!' : this.level === 1 ? '스트라이크 대장! 이번엔 판 맞히기!' : '판을 모두 쓰러뜨렸어요! 이번엔 타자가 나와요!');
  }

  nextLevel() {
    this.level = this.level >= LEVEL_COUNT ? 1 : this.level + 1;
    this.levelPulse = 1;
    this.resetLevel();
    this.state = 'levelIntro';
    const line =
      this.level === 2
        ? '2단계! 왼쪽으로 던지면 왼쪽 판, 오른쪽으로 던지면 오른쪽 판이 쓰러져요!'
        : this.level === 3
          ? '3단계! 타자가 못 치게 세게 휙! 던져요!'
          : '처음부터 다시! 미트에 쏙 던져요!';
    this.after(speak(line), () => this.ready());
  }

  panelPos(p) {
    return { x: this.tx + p.col * this.panelGap, y: this.ty + p.row * this.panelGap };
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    this.drawField(ctx);
    if (this.level === 2) this.drawBoard(ctx);
    else {
      if (this.level === 3) this.drawBatter(ctx);
      this.drawCatcher(ctx);
    }

    for (const p of this.people) drawAvatar(ctx, p.pose, this.colorOf(p.id));
    this.drawBallInHand(ctx);
    if (this.ball) {
      const b = this.ball;
      // 빠른 공은 뒤에 '휙' 줄
      if (this.state === 'fly' && b.power > 0.3) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = b.r * 0.6;
        for (const o of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(b.x + o * b.r, b.y + b.r * 0.2);
          ctx.lineTo(b.x + o * b.r + (b.x0 - b.x) * 0.12, b.y + (b.y0 - b.y) * 0.12);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (this.state !== 'result') baseball(ctx, b.x, b.y, b.r, b.spin);
    }
    this.drawSpeedStars(ctx);
    if (this.turnId !== null && this.state === 'ready') {
      const p = this.people.find((q) => q.id === this.turnId);
      const sh = p && shoulders(p.pose);
      if (sh) turnMarker(ctx, sh.mx, sh.my - sh.sw * 1.6, sh.sw * 0.28, this.colorOf(p.id), this.t);
    }
    if (this.state === 'intro') star(ctx, this.tx, this.ty - this.S * 2.4 + Math.sin(this.t * 4) * this.S * 0.2, this.S * 0.6, COLORS.yellow, '#fff');

    starGauge(ctx, this.game, this.goal, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVEL_COUNT, this.levelPulse);
  }

  // 하늘·담장·잔디, 멀리 흙 내야와 홈 플레이트, 아이 발밑엔 마운드
  drawField(ctx) {
    const { zone: z, unit, time } = this.game;
    const horizon = this.ty - this.S * 2.3;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    ctx.fillStyle = 'rgba(178,224,255,0.5)';
    ctx.fillRect(z.x, z.y, z.w, horizon - z.y);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const cx = z.x + ((((i * 0.37 + time * 0.012) % 1) + 1) % 1) * z.w;
      const cy = z.y + (horizon - z.y) * (0.35 + (i % 2) * 0.3);
      const r = unit * 0.022;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx + r * 1.1, cy - r * 0.4, r * 1.2, 0, Math.PI * 2);
      ctx.arc(cx + r * 2.2, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 홈 뒤 그물 담장
    ctx.fillStyle = 'rgba(46,140,90,0.65)';
    ctx.fillRect(z.x, horizon - unit * 0.02, z.w, unit * 0.02);
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const a = horizon + (z.y + z.h - horizon) * ((i / bands) ** 1.4);
      const b = horizon + (z.y + z.h - horizon) * (((i + 1) / bands) ** 1.4);
      ctx.fillStyle = i % 2 ? 'rgba(140,208,120,0.5)' : 'rgba(120,196,104,0.5)';
      ctx.fillRect(z.x, a, z.w, b - a + 1);
    }
    // 멀리 홈 플레이트 둘레 흙
    ctx.fillStyle = 'rgba(226,178,120,0.55)';
    ctx.beginPath();
    ctx.ellipse(this.tx, this.plateY, this.S * 4.2, this.S * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    // 홈 플레이트(오각형)
    const ps = this.S * 0.45;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(this.tx - ps, this.plateY - ps * 0.3);
    ctx.lineTo(this.tx + ps, this.plateY - ps * 0.3);
    ctx.lineTo(this.tx + ps, this.plateY + ps * 0.05);
    ctx.lineTo(this.tx, this.plateY + ps * 0.35);
    ctx.lineTo(this.tx - ps, this.plateY + ps * 0.05);
    ctx.closePath();
    ctx.fill();
    // 아이가 선 마운드(가까이, 아래쪽)
    ctx.fillStyle = 'rgba(205,150,95,0.55)';
    ctx.beginPath();
    ctx.ellipse(this.tx, z.y + z.h, z.w * 0.32, z.h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 쪼그려 앉은 곰 포수: 미트를 스트라이크 존에 대고 있다. 공을 받으면 미트가 찌그러진다.
  drawCatcher(ctx) {
    const S = this.S;
    const x = this.tx;
    const y = this.ty;
    ctx.save();
    ctx.fillStyle = '#2B3A67';
    ctx.beginPath();
    ctx.ellipse(x, y + S * 0.75, S * 0.95, S * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    bear(ctx, x, y - S * 0.55, S * 0.72);
    // 포수 마스크
    ctx.strokeStyle = 'rgba(80,80,90,0.8)';
    ctx.lineWidth = S * 0.07;
    ctx.beginPath();
    ctx.roundRect(x - S * 0.45, y - S * 0.75, S * 0.9, S * 0.7, S * 0.2);
    ctx.moveTo(x - S * 0.45, y - S * 0.4);
    ctx.lineTo(x + S * 0.45, y - S * 0.4);
    ctx.moveTo(x, y - S * 0.75);
    ctx.lineTo(x, y - S * 0.05);
    ctx.stroke();
    // 1단계: 미트 둘레 반짝이는 과녁
    if (this.level === 1 && this.state === 'ready') {
      ctx.globalAlpha = 0.5 + 0.35 * Math.abs(Math.sin(this.t * 4));
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = S * 0.12;
      ctx.beginPath();
      ctx.arc(x, y + S * 0.3, S * (1.1 + Math.sin(this.t * 4) * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    mitt(ctx, x, y + S * 0.3, S * 0.62, this.mittSquash);
    if (this.state === 'result' && !this.ball?.panel) baseball(ctx, x, y + S * 0.3, S * 0.22);
    ctx.restore();
  }

  // 3단계 타자: 홈 플레이트 왼쪽에 선 동물 친구. 빠른 공엔 늦게 헛스윙, 느린 공은 딱!
  drawBatter(ctx) {
    const S = this.S;
    const x = this.tx - S * 2.3;
    const y = this.ty - S * 0.1;
    const animal = BATTERS[this.batterIdx % BATTERS.length];
    // 스윙: 0 = 어깨 위로 든 방망이, 1 = 앞으로 휘두름
    let k = 0;
    if (this.swing && this.t >= this.swing.t) k = Math.min(1, (this.t - this.swing.t) / 0.15);
    if (this.state === 'ready' || this.state === 'levelIntro') {
      k = 0;
      this.swing = null;
    }
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#E3E3E3';
    ctx.lineWidth = S * 0.05;
    ctx.beginPath();
    ctx.ellipse(x, y + S * 1.0, S * 0.6, S * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const ang = lerp(-2.1, 0.15, k);
    bat(ctx, x + S * 0.4, y + S * 0.75, ang, S * 1.7, COLORS.red);
    animal(ctx, x, y, S * 0.7, this.t);
    // 헬멧
    ctx.fillStyle = COLORS.blue;
    ctx.beginPath();
    ctx.arc(x, y - S * 0.2, S * 0.58, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // 이번 타자 스트라이크 수(작은 공 3개)
    for (let i = 0; i < 3; i++) {
      const bx = x - S * 0.6 + i * S * 0.6;
      const by = y - S * 1.25;
      if (i < this.batterStrikes) baseball(ctx, bx, by, S * 0.2);
      else {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = S * 0.06;
        ctx.beginPath();
        ctx.arc(bx, by, S * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 2단계: 받침대 위 3×3 판. 맞으면 뒤로 넘어간다.
  drawBoard(ctx) {
    const S = this.S;
    const g = this.panelGap;
    const ps = this.panelS;
    ctx.save();
    // 받침대 다리와 틀
    ctx.strokeStyle = '#8E5B34';
    ctx.lineWidth = S * 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.tx - g * 1.2, this.ty + g * 1.4);
    ctx.lineTo(this.tx - g * 1.3, this.plateY + S * 0.3);
    ctx.moveTo(this.tx + g * 1.2, this.ty + g * 1.4);
    ctx.lineTo(this.tx + g * 1.3, this.plateY + S * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#B9803E';
    ctx.beginPath();
    ctx.roundRect(this.tx - g * 1.62, this.ty - g * 1.62, g * 3.24, g * 3.24, S * 0.25);
    ctx.fill();
    ctx.fillStyle = 'rgba(61,44,46,0.55)';
    ctx.beginPath();
    ctx.roundRect(this.tx - g * 1.5, this.ty - g * 1.5, g * 3, g * 3, S * 0.18);
    ctx.fill();
    for (const p of this.panels) {
      const { x, y } = this.panelPos(p);
      if (p.down >= 1) continue;
      // 위쪽을 축으로 뒤로 넘어가며 납작해진다.
      const k = 1 - p.down;
      ctx.save();
      ctx.translate(x, y - ps / 2);
      ctx.scale(1, k);
      ctx.fillStyle = RAINBOW[p.i % RAINBOW.length];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = S * 0.08;
      ctx.beginPath();
      ctx.roundRect(-ps / 2, 0, ps, ps, ps * 0.18);
      ctx.fill();
      ctx.stroke();
      star(ctx, 0, ps / 2, ps * 0.26, '#fff');
      ctx.restore();
    }
    if (this.state === 'result' && this.ball?.panel) {
      const { x, y } = this.panelPos(this.ball.panel);
      baseball(ctx, x, y + ps * 0.2 + (1.3 - this.stateT) * S * 1.2, S * 0.22);
    }
    ctx.restore();
  }

  // 차례인 아이(혼자면 그 아이)의 높이 든 손에 공을 쥐여 준다.
  drawBallInHand(ctx) {
    if (this.state !== 'ready' && this.state !== 'intro' && this.state !== 'levelIntro') return;
    for (const p of this.people) {
      if (p.lost || (this.turnId !== null && p.id !== this.turnId)) continue;
      const sh = shoulders(p.pose);
      if (!sh) continue;
      const ws = [p.pose[P.lWrist], p.pose[P.rWrist]].filter((w) => visible(w, 0.35));
      if (!ws.length) continue;
      const w = ws.reduce((a, b) => (b.y < a.y ? b : a));
      baseball(ctx, w.x, w.y - sh.sw * 0.12, sh.sw * 0.2);
    }
  }

  // 공 빠르기 별(1~3개)이 도착한 자리 위로 떠오른다.
  drawSpeedStars(ctx) {
    const s = this.speedStars;
    if (!s) return;
    const age = this.t - s.t;
    if (age > 1.2) return;
    const S = this.S;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1.2 - age) * 3);
    for (let i = 0; i < s.n; i++) {
      const x = s.x + (i - (s.n - 1) / 2) * S * 0.75;
      const y = s.y - S * 1.3 - age * S * 0.8;
      star(ctx, x, y, S * 0.32 * (1 + Math.max(0, 0.3 - age)), COLORS.yellow, '#F4A100');
    }
    ctx.restore();
  }
}

// 놀이 설명: 친구가 공을 든 손을 머리 위로 들었다가 휙! 던지면 멀리 곰 포수 미트에 쏙
export const guide = {
  text: '공을 든 손을 머리 위로 번쩍! 들었다가 앞으로 휙! 던져요. 스트라이크!',
  demo: (ctx, s, t) => {
    const period = 3.0;
    const p = t % period;
    ctx.fillStyle = 'rgba(126,206,98,0.55)';
    ctx.fillRect(-s * 8, -s * 1.6, s * 16, s * 7);
    // 멀리 곰 포수(오른쪽 위)
    const cx = s * 2.4;
    const cy = -s * 2.0;
    ctx.fillStyle = '#2B3A67';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.5, s * 0.55, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    bear(ctx, cx, cy - s * 0.3, s * 0.42);
    const caught = p > 1.55 && p < 2.6;
    mitt(ctx, cx - s * 0.1, cy + s * 0.2, s * 0.36, caught ? Math.max(0, 1 - (p - 1.55) * 3) : 0);
    // 친구: 0~0.8초 손 번쩍(공 들기), 0.8~1.0초 휙 던지기, 그 뒤 앞으로 뻗은 손
    const kx = -s * 2.2;
    const ky = s * 1.2;
    const raise = clamp(p / 0.6, 0, 1);
    const throwK = clamp((p - 0.8) / 0.2, 0, 1);
    let hand;
    if (throwK <= 0) hand = [lerp(0.7, 0.35, raise), lerp(0.4, -1.75, raise)];
    else hand = [lerp(0.35, 1.25, throwK), lerp(-1.75, -0.2, throwK)];
    kid(ctx, kx, ky, s, { hands: [[-0.7, 0.3], hand], legUp: p > 0.75 && p < 1.3 ? -1 : 0 });
    const hx = kx + hand[0] * s;
    const hy = ky + hand[1] * s;
    if (p < 0.95) baseball(ctx, hx, hy - s * 0.15, s * 0.22);
    else if (p < 1.55) {
      const k = (p - 0.95) / 0.6;
      const e = easeOut(k);
      baseball(ctx, lerp(kx + 1.25 * s, cx - s * 0.1, e), lerp(ky - 0.3 * s, cy + s * 0.2, e) - Math.sin(Math.PI * k) * s * 0.6, s * lerp(0.24, 0.13, e), k * 12);
    } else if (caught) {
      baseball(ctx, cx - s * 0.1, cy + s * 0.2, s * 0.13);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + p * 2;
        star(ctx, cx + Math.cos(a) * s * 0.8, cy + s * 0.2 + Math.sin(a) * s * 0.7, s * 0.16, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// 메뉴 아이콘: 위로 든 손의 야구공과 '휙' 줄
export function menuIcon(ctx, r, t = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(205,150,95,0.6)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  mitt(ctx, r * 0.35, -r * 0.2, r * 0.32);
  const k = (t * 0.8) % 1;
  const x = lerp(-r * 0.5, r * 0.3, k);
  const y = lerp(r * 0.35, -r * 0.2, k);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.06;
  for (const o of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, y + o * r * 0.08 + r * 0.06);
    ctx.lineTo(x - r * 0.5, y + o * r * 0.08 + r * 0.2);
    ctx.stroke();
  }
  baseball(ctx, x, y, r * lerp(0.22, 0.14, k), t * 6);
}
