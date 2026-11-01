import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { penguin } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { drawAvatar, kneeUp, perPerson, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 10; // 한 단계에서 넣을 골(별) 수
// 단계별 난이도: roll = 공이 골대 앞에서 발밑까지 굴러오는 시간(초),
// sway/swaySpeed = 골키퍼가 좌우로 오가는 폭(골대 반폭 배)·빠르기, save = 골키퍼가 막을 확률
const LEVELS = [
  { roll: 3.0, sway: 0, swaySpeed: 0, save: 0 },
  { roll: 2.4, sway: 0.45, swaySpeed: 0.7, save: 0.25 },
  { roll: 1.8, sway: 0.6, swaySpeed: 1.0, save: 0.35 },
];
const SAVE_STREAK = 1; // 골키퍼가 연달아 막는 최대 횟수(두 번 연속으로는 안 막는다)
const FLIGHT_TIME = 0.95; // 찬 공이 골대까지 날아가는 시간(초)
const FAR_SCALE = 0.42; // 골대 쪽(멀리)에 있을 때 공 크기 배율(원근감)
const KICKABLE_FROM = 0.55; // 굴러오는 공이 이만큼(0~1) 내려오면 벌써 찰 수 있다
const BOUNCE_BACK_TIME = 1.3; // 골키퍼가 막은 공이 통통 되돌아오는 시간(초)
const GOAL_PAUSE = 1.6; // 골인 뒤 다음 공까지(초)

// ---- 발차기 판정(모두 어깨너비 sw 배, 아이 키·거리와 무관) — 실제 아이와 해 보며 조정할 추정값 ----
const FOOT_VIS = 0.5; // 발끝·발목 인식 신뢰도 기준
const SWING_WINDOW = 0.15; // 이 시간(초) 동안 움직인 거리로 빠르기를 잰다(한 프레임 떨림은 무시)
const KICK_SPEED = 3.5; // 발이 이 빠르기(sw/초) 이상이면 '휙' 찬 것
const KICK_MOVE = 0.35; // 그동안 적어도 이만큼은 움직여야(가만히 서 있을 때 떨림 방지)
const KICK_NEAR = 1.3; // 발이 지나간 길이 공에서 이 거리 안이면 맞은 것(넉넉하게)
const KICK_Y_SQUASH = 2.5; // 세로 거리는 이만큼 나눠서 잰다(공은 놀이 영역 아래에 붙어 있고 실제 발은 더 아래일 수 있어서)
const KNEE_NEAR = 2.5; // 무릎 들기·엉덩이 들썩 판정은 공에서 가로로 이 안에 있는 아이만
const LEG_HINT_AFTER = 3; // 발이 이만큼(초) 안 보이면 "조금 뒤로 가서" 안내(한 번) + 엉덩이 판정 켜기
const LOWER_VIS = 0.3; // '엉덩이 아래가 보인다'로 칠 무릎·발 신뢰도
const HIP_LIFT = 0.15; // 다리가 안 보일 때: 두 엉덩이 높이 차가 평소보다 이만큼 바뀌면 무릎을 든 것으로 본다
const HIP_FOLLOW = 1.0; // 엉덩이 기준값이 따라가는 빠르기(1/초)
// 엉덩이 아래가 아무것도 안 보이는 채로 이만큼(초) 지나면(태블릿에 너무 가까이 선 경우)
// 손을 공 쪽으로 '휙' 아래로 내리는 동작도 차기로 받아 준다 — 놀이가 막히지 않게 하는 마지막 대안
const HAND_FALLBACK_AFTER = 10;
const HAND_SPEED = 4; // 손 빠르기 기준(sw/초)
const HAND_MOVE = 0.5;
const HAND_NEAR = 2.0; // 손이 공에서 가로로 이 안에서 움직여야
const WAIT_VOICE_AFTER = 6; // 공이 발밑에서 이만큼(초) 기다리면 다시 안내
const WAIT_VOICE_GAP = 9;
const GOAL_VOICES = ['골인!', '골인! 멋져요!', '슛! 골인!', '골인! 최고예요!'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// 축구 공 차기: 위쪽 골대 앞에서 공이 굴러와 아이 발밑에 멈추면 발로 뻥! 차서 골대에 넣는다.
// 2단계부터 펭귄 골키퍼가 좌우로 움직이며 가끔 막는다(벌점 없음, "아깝다! 다시!").
// 두 명이면 공이 번갈아 한 아이씩 찾아가고, 그 아이 발밑에 아바타 색 표시를 그린다(누가 차도 인정).
export class SoccerScene {
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
    this.gw = Math.min(z.w * 0.46, unit * 0.6);
    this.gh = this.gw * 0.36;
    this.gx = z.x + z.w / 2;
    // 위쪽 별 게이지·단계 표시와 겹치지 않게 그 아래에 골대를 둔다.
    this.gy = Math.max(z.y + z.h * 0.18, h * 0.055 + unit * 0.035 * 6.4);
    this.goalLine = this.gy + this.gh;
    this.br = unit * 0.055;
    this.keeperS = this.gh * 0.36;
    this.defaultKickY = z.y + z.h - this.br * 1.25;
    if (this.kickY === undefined || this.state === undefined) this.kickY = this.defaultKickY;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.states = new Map(); // 아이 id → 발·손 움직임 기록
    this.colors = new Map();
    this.people = [];
    this.targetId = null;
    this.lastTargetId = null;
    this.saveStreak = 0;
    this.netShake = 0;
    this.netHit = { x: this.gx, y: this.gy + this.gh / 2 };
    this.keeper = { u: 0, dive: null, hold: null, dir: 0, happy: 0 };
    this.kickY = this.defaultKickY;
    this.ball = { x: this.gx, y: this.kickY, scale: 1, rot: 0, shadowY: this.kickY, alpha: 1 };
    this.legHintSaid = false;
    this.handHintSaid = false;
    this.handMode = false;
    this.lastWaitVoice = -Infinity;
    sfx.whistle();
    this.after(speak('공이 굴러오면 발로 뻥! 차서 골대에 넣어요!'), () => this.newBall());
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

  get kickable() {
    return this.state === 'ready' || (this.state === 'roll' && this.rollK >= KICKABLE_FROM);
  }

  // 아이마다 아바타 색을 정해 두고(파랑·분홍), 발밑 표시도 같은 색으로 그린다.
  colorOf(id) {
    if (!this.colors.has(id)) {
      const present = new Set(this.people.filter((p) => p.id !== id).map((p) => this.colors.get(p.id)));
      this.colors.set(id, PLAYER_COLORS.find((c) => !present.has(c)) ?? PLAYER_COLORS[0]);
    }
    return this.colors.get(id);
  }

  // 보호자·PC 테스트용: 터치 = 차기. 화면 위쪽을 누르면 그쪽으로 찬다.
  onTap(x, y) {
    if (!this.kickable) return;
    const u = y < this.goalLine + this.gh ? (x - this.gx) / (this.gw / 2) : this.randomAim();
    this.kick(clamp(u, -0.85, 0.85));
  }

  // ---------------- 진행 ----------------

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.netShake = Math.max(0, this.netShake - dt * 1.6);
    this.people = input.people;
    for (const p of this.people) this.colorOf(p.id);

    const events = this.sense(dt, this.people);
    this.updateTarget(dt);
    this.updateKeeper(dt);
    this.updateBall(dt);

    if (this.kickable) for (const e of events) if (this.tryEvent(e)) break;

    // 공이 발밑에서 오래 기다리면 다시 알려 준다(혼내지 않고 방법만).
    if (this.state === 'ready') {
      this.readyT += dt;
      if (this.readyT > WAIT_VOICE_AFTER && this.game.time - this.lastWaitVoice > WAIT_VOICE_GAP) {
        this.lastWaitVoice = this.game.time;
        speak(this.handMode ? '손을 공 쪽으로 휙! 내려서 차 봐요!' : '발로 공을 뻥! 차 보세요!');
      }
    }
  }

  // 아이 움직임을 읽어 '찼다' 후보들을 돌려준다. 새 인식 결과가 들어온 프레임에만 계산한다.
  sense(dt, people) {
    const now = this.game.time;
    const events = [];
    let noFeetLong = false;
    let noLowerLong = false;
    for (const p of perPerson(this.states, people)) {
      const s = p.state;
      s.noFeetT = (s.noFeetT ?? 0) + dt;
      s.noLowerT = (s.noLowerT ?? 0) + dt;
      if (s.noFeetT >= LEG_HINT_AFTER) noFeetLong = true;
      if (s.noLowerT >= HAND_FALLBACK_AFTER) noLowerLong = true;
      if (p.lost || p.pose === s.lastPose) continue; // 놓친 아이(멈춘 자세)·같은 인식 결과는 건너뜀
      s.lastPose = p.pose;
      const fdt = now - (s.lastT ?? now);
      s.lastT = now;
      const pose = p.pose;
      const sh = shoulders(pose);
      if (!sh) continue;
      const sw = sh.sw;

      // 1) 발(발끝, 없으면 발목)이 빠르게 공을 지나가면 차기
      let feet = false;
      for (const side of ['l', 'r']) {
        const [fi, ai] = side === 'l' ? [31, P.lAnkle] : [32, P.rAnkle];
        const src = visible(pose[fi], FOOT_VIS) ? fi : visible(pose[ai], FOOT_VIS) ? ai : -1;
        const hist = (s[`f${side}`] ??= { src: -1, pts: [] });
        if (src < 0) {
          hist.src = -1;
          hist.pts.length = 0;
          continue;
        }
        feet = true;
        if (hist.src !== src) {
          // 발끝 ↔ 발목으로 바뀌면 위치가 튀므로 기록을 새로 시작
          hist.src = src;
          hist.pts.length = 0;
        }
        const sw1 = swing(hist, pose[src], now, sw, KICK_SPEED, KICK_MOVE);
        if (!sw1) continue;
        const near = this.footNear(sw1);
        if (near.d < Math.max(KICK_NEAR * sw, this.br * 1.6)) {
          events.push({ kind: 'foot', p, sw, cx: near.x, dir: sw1.dx / sw1.d });
          hist.pts.length = 0;
        }
      }
      if (feet) s.noFeetT = 0;
      if (feet || [P.lKnee, P.rKnee, P.lAnkle, P.rAnkle, 29, 30, 31, 32].some((i) => visible(pose[i], LOWER_VIS))) s.noLowerT = 0;

      // 2) 무릎을 번쩍 들면(공이 발밑에 있을 때) 차기
      let knees = false;
      for (const side of ['l', 'r']) {
        const up = kneeUp(pose, side);
        if (up === null) continue;
        knees = true;
        if (up && s[`k${side}`] === false) events.push({ kind: 'knee', p, sw });
        s[`k${side}`] = up;
      }

      // 3) 다리가 안 보일 때: 엉덩이 한쪽이 들썩(무릎 들기)하면 차기
      const lh = pose[P.lHip];
      const rh = pose[P.rHip];
      if (!knees && s.noFeetT >= LEG_HINT_AFTER && visible(lh) && visible(rh)) {
        const d = (lh.y - rh.y) / sw;
        s.hipBase ??= d;
        const off = Math.abs(d - s.hipBase);
        if (off > HIP_LIFT) {
          if (!s.hipUp) events.push({ kind: 'hip', p, sw });
          s.hipUp = true;
          s.hipUpT = (s.hipUpT ?? 0) + fdt;
          if (s.hipUpT > 2) s.hipBase = d; // 비스듬히 선 자세가 오래가면 기준을 새로 잡는다
        } else {
          if (off < HIP_LIFT * 0.5) s.hipUp = false;
          s.hipUpT = 0;
          s.hipBase += (d - s.hipBase) * Math.min(1, fdt * HIP_FOLLOW);
        }
      } else {
        s.hipBase = undefined;
        s.hipUp = false;
      }

      // 4) 엉덩이 아래가 오래 안 보이면: 손을 공 쪽으로 휙 내리기
      if (s.noLowerT >= HAND_FALLBACK_AFTER) {
        for (const side of ['l', 'r']) {
          const wi = side === 'l' ? P.lWrist : P.rWrist;
          const hist = (s[`h${side}`] ??= { pts: [] });
          if (!visible(pose[wi], 0.4)) {
            hist.pts.length = 0;
            continue;
          }
          const sw1 = swing(hist, pose[wi], now, sw, HAND_SPEED, HAND_MOVE);
          if (!sw1 || sw1.dy < sw1.d * 0.6 || sw1.by < sh.my) continue; // 아래로 내리는 동작, 어깨보다 아래에서
          const x = Math.abs(sw1.ax - this.ball.x) < Math.abs(sw1.bx - this.ball.x) ? sw1.ax : sw1.bx;
          if (Math.abs(x - this.ball.x) < HAND_NEAR * sw || (sw1.ax - this.ball.x) * (sw1.bx - this.ball.x) < 0) {
            events.push({ kind: 'hand', p, sw, cx: x });
            hist.pts.length = 0;
          }
        }
      } else {
        s.hl = s.hr = undefined;
      }
    }

    // 다리가 안 보이면 한 번만 뒤로 가 보라고 안내, 아주 오래 안 보이면 손 차기를 알려 준다.
    const playing = this.state !== 'intro' && this.state !== 'celebrate';
    if (playing && noFeetLong && !this.legHintSaid) {
      this.legHintSaid = true;
      speak('조금 뒤로 가서 발이 보이게 해 볼까요?');
    }
    this.handMode = noLowerLong;
    if (playing && noLowerLong && !this.handHintSaid) {
      this.handHintSaid = true;
      speak('발이 안 보이면 손으로 휙! 내려도 돼요!');
    }
    return events;
  }

  // 발이 지나간 길(선분)과 공 사이 거리. 세로는 줄여서 재고, 가장 가까운 지점의 x 도 돌려준다.
  footNear(m) {
    const b = this.ball;
    const q = KICK_Y_SQUASH;
    const ax = m.ax - b.x;
    const ay = (m.ay - b.y) / q;
    const dx = m.bx - m.ax;
    const dy = (m.by - m.ay) / q;
    const len2 = dx * dx + dy * dy;
    const k = len2 ? clamp(-(ax * dx + ay * dy) / len2, 0, 1) : 1;
    return { d: Math.hypot(ax + dx * k, ay + dy * k), x: m.ax + dx * k };
  }

  tryEvent(e) {
    if (e.kind !== 'foot' && Math.abs((e.cx ?? e.p.center.x) - this.ball.x) > KNEE_NEAR * e.sw) return false;
    let u = this.randomAim();
    if (e.kind === 'foot') {
      // 공의 왼쪽을 차면 오른쪽으로, 오른쪽을 차면 왼쪽으로 + 발이 움직인 방향 + 아이가 선 위치
      const side = (e.cx - this.ball.x) / e.sw;
      u = this.positionAim() - side * 0.7 + e.dir * 0.3 + (Math.random() - 0.5) * 0.25;
    }
    this.kick(clamp(u, -0.85, 0.85));
    return true;
  }

  // 아이가 왼쪽에 서 있으면 골대 왼쪽으로, 오른쪽이면 오른쪽으로 가는 경향
  positionAim() {
    return ((this.ball.x - this.gx) / (this.game.zone.w / 2)) * 0.6;
  }

  randomAim() {
    return this.positionAim() + (Math.random() - 0.5) * 0.9;
  }

  get keeperHalfU() {
    return (this.keeperS * 0.95) / (this.gw / 2);
  }

  // 공 차기! 결과(골인/막음)는 찰 때 정해 두고, 골키퍼가 그에 맞춰 움직인다.
  kick(u) {
    const k = this.keeper;
    const reach = this.keeperHalfU + (this.br * FAR_SCALE) / (this.gw / 2);
    const save = this.cfg.save > 0 && this.saveStreak < SAVE_STREAK && Math.random() < this.cfg.save;
    k.dive = k.hold = null;
    if (save) {
      this.saveStreak++;
      k.dive = clamp(u, -0.7, 0.7);
    } else {
      this.saveStreak = 0;
      if (Math.abs(u - k.u) < reach + 0.1) {
        const sign = u >= k.u ? 1 : -1;
        const away = u - sign * (reach + 0.3); // 골키퍼가 반대쪽으로 몸을 날린다(귀여운 실수)
        if (this.level > 1 && Math.abs(away) <= 0.78) k.dive = away;
        else {
          // 1단계 골키퍼는 가만히 있으므로 공이 골키퍼 옆으로 지나가게 한다.
          u = k.u + sign * (reach + 0.15);
          if (Math.abs(u) > 0.88) u = k.u - sign * (reach + 0.15);
        }
      }
    }
    if (k.dive !== null) k.dir = Math.sign(k.dive - k.u) || 1;
    else k.hold = k.u; // 골인할 공이면 골키퍼는 그 자리에 멈춰 공이 몸을 뚫고 지나가 보이지 않게
    const b = this.ball;
    const x1 = this.gx + (save ? k.dive : u) * (this.gw / 2);
    const y1 = save ? this.goalLine - this.keeperS * 1.1 : this.gy + this.gh * (0.3 + Math.random() * 0.35);
    this.fly = { x0: b.x, y0: b.y, s0: b.scale, x1, y1, t: 0, save };
    this.state = 'fly';
    sfx.bonk();
    sfx.whoosh();
    const { particles, unit } = this.game;
    particles.burst(b.x, b.y, { count: 12, colors: ['#fff', COLORS.yellow], speed: unit * 0.35, size: unit * 0.012, gravity: 250, life: 0.5 });
  }

  // 새 공: 골대 앞에서 굴러 나와 이번 차례 아이의 발밑으로 온다. 두 명이면 번갈아.
  newBall() {
    const people = this.people.filter((p) => !p.lost);
    let target = people[0] ?? null;
    if (people.length >= 2) target = people.find((p) => p.id !== this.lastTargetId) ?? people[0];
    this.targetId = target?.id ?? null;
    if (target) this.lastTargetId = target.id;
    const b = this.ball;
    b.x = this.gx + (Math.random() - 0.5) * this.gw * 0.4;
    b.y = this.goalLine + this.br * 0.6;
    b.scale = FAR_SCALE;
    b.alpha = 1;
    this.rollFrom = { x: b.x, y: b.y };
    this.rollT = 0;
    this.rollK = 0;
    this.keeper.dive = this.keeper.hold = null;
    this.state = 'roll';
    sfx.peek();
  }

  // 차례인 아이를 찾아(없어졌으면 공에 가장 가까운 아이) 공이 멈출 자리(가로 위치, 발 높이)를 정한다.
  updateTarget(dt) {
    const people = this.people.filter((p) => !p.lost);
    let t = people.find((p) => p.id === this.targetId);
    if (!t && people.length && this.state !== 'fly') {
      t = people.reduce((a, p) => (Math.abs(p.center.x - this.ball.x) < Math.abs(a.center.x - this.ball.x) ? p : a));
      this.targetId = t.id;
    }
    const { zone: z, homeButton: hb } = this.game;
    let ky = this.defaultKickY;
    const foot = t && footY(t.pose);
    if (foot !== null && foot !== undefined) ky = clamp(foot - this.br * 0.6, z.y + z.h * 0.6, this.defaultKickY);
    this.kickY += (ky - this.kickY) * Math.min(1, dt * 3);
    // 집 버튼(놀이 영역 왼쪽 가운데)과 공이 멈출 자리가 겹치면 공을 오른쪽으로 비켜 둔다.
    let minX = z.x + this.br * 1.5;
    if (hb && Math.abs(this.kickY - hb.y) < hb.r + this.br * 1.6) minX = Math.max(minX, hb.x + hb.r + this.br * 1.6);
    const maxX = z.x + z.w - this.br * 1.5;
    if (t) this.spotX = t.center.x;
    this.spotX = clamp(this.spotX ?? this.gx, minX, maxX);
  }

  updateKeeper(dt) {
    const k = this.keeper;
    const cfg = this.cfg;
    const sway = cfg.sway ? Math.sin(this.t * cfg.swaySpeed) * cfg.sway : 0;
    const target = k.dive ?? k.hold ?? sway;
    k.u += (target - k.u) * Math.min(1, dt * (k.dive !== null ? 7 : 2.5));
    k.happy = Math.max(0, k.happy - dt);
  }

  updateBall(dt) {
    const b = this.ball;
    const { zone: z } = this.game;
    switch (this.state) {
      case 'intro':
        b.x = this.spotX ?? this.gx;
        b.y = this.kickY;
        b.shadowY = b.y;
        break;
      case 'roll': {
        this.rollT += dt;
        const k = Math.min(1, this.rollT / this.cfg.roll);
        this.rollK = k;
        const prevX = b.x;
        const prevY = b.y;
        b.x = lerp(this.rollFrom.x, this.spotX, easeOut(k));
        b.y = lerp(this.rollFrom.y, this.kickY, k);
        b.scale = lerp(FAR_SCALE, 1, k);
        b.shadowY = b.y;
        b.rot += (Math.hypot(b.x - prevX, b.y - prevY) / (this.br * b.scale)) * (b.x >= prevX ? 1 : -1);
        if (k >= 1) {
          this.state = 'ready';
          this.readyT = 0;
        }
        break;
      }
      case 'ready': {
        // 아이가 옆으로 움직이면 공도 발밑을 따라간다.
        const prevX = b.x;
        b.x += (this.spotX - b.x) * Math.min(1, dt * 4);
        b.y += (this.kickY - b.y) * Math.min(1, dt * 4);
        b.shadowY = b.y;
        b.scale = 1;
        b.rot += (b.x - prevX) / this.br;
        break;
      }
      case 'fly': {
        const f = this.fly;
        f.t += dt;
        const k = Math.min(1, f.t / FLIGHT_TIME);
        const e = easeOut(k);
        const arc = Math.sin(Math.PI * k) * this.game.unit * 0.13;
        b.x = lerp(f.x0, f.x1, e);
        b.shadowY = lerp(f.y0, f.save ? this.goalLine : this.goalLine - this.gh * 0.08, e);
        b.y = lerp(f.y0, f.y1, e) - arc;
        b.scale = lerp(f.s0, FAR_SCALE, e);
        b.rot += dt * 14;
        if (k >= 1) (f.save ? this.saved() : this.scored());
        break;
      }
      case 'goal':
        // 그물에 걸린 공은 바닥으로 톡 떨어진다.
        this.stateT -= dt;
        b.y = Math.min(this.goalLine - this.br * FAR_SCALE * 0.8, b.y + dt * this.gh * 0.9);
        b.alpha = clamp(this.stateT / 0.5, 0, 1);
        if (this.stateT <= 0) {
          this.keeper.dive = this.keeper.hold = null;
          if (this.score >= GOAL) this.celebrate();
          else this.newBall();
        }
        break;
      case 'bounce': {
        // 골키퍼가 막은 공이 통통 튀며 아이에게 되돌아온다.
        this.stateT += dt;
        const k = Math.min(1, this.stateT / BOUNCE_BACK_TIME);
        const hops = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * this.game.unit * 0.08;
        b.x = lerp(this.bounceFrom.x, this.spotX, k);
        b.shadowY = lerp(this.goalLine, this.kickY, k);
        b.y = b.shadowY - hops;
        b.scale = lerp(FAR_SCALE, 1, k);
        b.rot -= dt * 8;
        if (k >= 0.35) this.keeper.dive = this.keeper.hold = null;
        if (k >= 1) {
          this.state = 'ready';
          this.readyT = 0;
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
    b.y = Math.min(b.y, z.y + z.h);
  }

  scored() {
    const b = this.ball;
    this.state = 'goal';
    this.stateT = GOAL_PAUSE;
    this.netShake = 1;
    this.netHit = { x: b.x, y: b.y };
    sfx.success();
    sfx.sparkle(0.1);
    const { particles, unit } = this.game;
    particles.burst(b.x, b.y, { count: 26, colors: RAINBOW, speed: unit * 0.5, size: unit * 0.016, shape: 'star', gravity: 200 });
    particles.ring(b.x, b.y, { color: '#fff', size: unit * 0.06 });
    speak(pick(GOAL_VOICES));
    this.pulse[this.score] = 1;
    this.score++;
  }

  // 골키퍼가 막아도 벌점은 없다. 공이 다시 아이에게 돌아온다.
  saved() {
    const b = this.ball;
    this.state = 'bounce';
    this.stateT = 0;
    this.bounceFrom = { x: b.x, y: b.y };
    this.keeper.happy = 1.2;
    sfx.boing();
    this.game.particles.burst(b.x, b.y, { count: 10, colors: ['#fff', COLORS.yellow], speed: this.game.unit * 0.3, size: this.game.unit * 0.012, gravity: 200, life: 0.6 });
    speak('아깝다! 다시!');
  }

  // 한 단계 성공: 축하하고 다음 단계로. 3단계까지 모두 하면 크게 축하하고 1단계부터 다시.
  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    sfx.fanfare();
    sfx.whistle();
    speak(
      last
        ? '3단계까지 모두 성공! 최고의 축구 선수예요!'
        : this.level === 1
          ? '골인 대장! 2단계! 이제 펭귄 골키퍼가 움직여요!'
          : '대단해요! 3단계! 공이 더 빨리 와요!',
    );
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    this.level = this.level >= LEVELS.length ? 1 : this.level + 1;
    this.saveStreak = 0;
    this.newBall();
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    const { unit } = this.game;
    this.drawField(ctx);

    // 이번 차례 아이 발밑 표시(아바타 색)
    const target = this.people.find((p) => p.id === this.targetId && !p.lost);
    if (target && ['roll', 'ready', 'bounce'].includes(this.state)) this.drawMarker(ctx, target);

    // 풀밭 위에 아바타를 한 번 더 그려 아이가 자기 발 위치를 볼 수 있게 한다.
    for (const p of this.people) drawAvatar(ctx, p.pose, this.colorOf(p.id));

    this.drawNet(ctx);
    this.drawKeeper(ctx);
    const inGoal = this.state === 'goal';
    if (inGoal) this.drawBall(ctx);
    this.drawPosts(ctx);
    if (!inGoal && this.state !== 'celebrate') this.drawBall(ctx);
    if (this.state === 'ready' && this.readyT > 1.5) this.drawKickCue(ctx);
    if (this.state === 'intro') star(ctx, this.gx, this.gy - unit * 0.05 + Math.sin(this.t * 4) * unit * 0.01, unit * 0.03, COLORS.yellow, '#fff');

    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  drawField(ctx) {
    const { zone: z, unit } = this.game;
    const { gx, gw, goalLine } = this;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    // 줄무늬 잔디(카메라 속 아이가 비쳐 보이게 반투명)
    const n = 8;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(126,206,98,0.6)' : 'rgba(104,190,84,0.6)';
      ctx.fillRect(z.x, z.y + (i * z.h) / n, z.w, z.h / n + 1);
    }
    // 하얀 선: 골라인, 원근감 있는 페널티 박스, 반원
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = unit * 0.008;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(z.x, goalLine);
    ctx.lineTo(z.x + z.w, goalLine);
    const bot = goalLine + (z.y + z.h - goalLine) * 0.42;
    ctx.moveTo(gx - gw * 0.85, goalLine);
    ctx.lineTo(gx - gw * 1.1, bot);
    ctx.lineTo(gx + gw * 1.1, bot);
    ctx.lineTo(gx + gw * 0.85, goalLine);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(gx, bot, gw * 0.4, gw * 0.12, 0, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(gx, lerp(goalLine, bot, 0.6), unit * 0.01, unit * 0.006, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 그물: 골인하면 공이 맞은 자리를 중심으로 출렁인다.
  drawNet(ctx) {
    const { gx, gy, gw, gh } = this;
    const L = gx - gw / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(L, gy, gw, gh);
    const cols = 12;
    const rows = 5;
    const amp = this.netShake * Math.cos(this.netShake * 30) * gh * 0.22;
    const hit = this.netHit ?? { x: gx, y: gy + gh / 2 };
    const R = gw * 0.22;
    const pt = (i, j) => {
      const x = L + (i * gw) / cols;
      const y = gy + (j * gh) / rows;
      const f = Math.exp(-((x - hit.x) ** 2 + (y - hit.y) ** 2) / (R * R));
      const edge = i === 0 || i === cols || j === 0 || j === rows ? 0 : 1; // 테두리는 골대에 묶여 있음
      return [x, y - amp * f * edge];
    };
    ctx.strokeStyle = 'rgba(120,120,130,0.55)';
    ctx.lineWidth = Math.max(1, gw * 0.005);
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) (j ? ctx.lineTo : ctx.moveTo).call(ctx, ...pt(i, j));
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...pt(i, j));
    ctx.stroke();
    ctx.restore();
  }

  drawPosts(ctx) {
    const { gx, gy, gw, goalLine } = this;
    const L = gx - gw / 2;
    const R = gx + gw / 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(L, goalLine);
      ctx.lineTo(L, gy);
      ctx.lineTo(R, gy);
      ctx.lineTo(R, goalLine);
    };
    path();
    ctx.strokeStyle = 'rgba(61,44,46,0.35)';
    ctx.lineWidth = gw * 0.045;
    ctx.stroke();
    path();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = gw * 0.032;
    ctx.stroke();
    ctx.restore();
  }

  drawKeeper(ctx) {
    const k = this.keeper;
    const s = this.keeperS;
    const x = this.gx + k.u * (this.gw / 2);
    const feet = this.goalLine;
    const hop = k.happy > 0 ? Math.abs(Math.sin(k.happy * 10)) * s * 0.3 : Math.abs(Math.sin(this.t * 3)) * s * 0.06;
    const tilt = k.dive !== null ? k.dir * 0.45 : this.cfg.sway ? Math.sin(this.t * this.cfg.swaySpeed * 2) * 0.06 : 0;
    ctx.save();
    ctx.translate(x, feet - hop);
    ctx.rotate(tilt);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.05, s * 0.8, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    penguin(ctx, 0, -s * 1.15, s);
    // 골키퍼 장갑
    for (const side of [-1, 1]) {
      const up = k.dive !== null ? -s * 0.9 : 0;
      ctx.fillStyle = COLORS.yellow;
      ctx.strokeStyle = '#E0A800';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.arc(side * s * 1.0, -s * 0.75 + up, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBall(ctx) {
    const b = this.ball;
    const r = this.br * b.scale;
    ctx.save();
    ctx.globalAlpha = b.alpha ?? 1;
    // 땅 그림자(공이 뜨면 공과 떨어져 보인다)
    const lift = Math.max(0, b.shadowY - b.y);
    ctx.fillStyle = `rgba(0,0,0,${0.18 * Math.max(0.3, 1 - lift / (this.game.unit * 0.2))})`;
    ctx.beginPath();
    ctx.ellipse(b.x, b.shadowY + r * 0.85, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // 기다리는 공은 통통 살짝 튄다.
    const bob = this.state === 'ready' || this.state === 'intro' ? Math.abs(Math.sin(this.t * 4)) * r * 0.15 : 0;
    soccerBall(ctx, b.x, b.y - bob, r, b.rot);
    ctx.restore();
  }

  drawMarker(ctx, p) {
    const { zone: z } = this.game;
    const color = this.colorOf(p.id);
    const fy = footY(p.pose);
    const y = clamp(fy ?? this.kickY + this.br * 0.9, z.y + z.h * 0.5, z.y + z.h - this.br * 0.3);
    const x = clamp(p.center.x, z.x, z.x + z.w);
    const k = 1 + Math.sin(this.t * 5) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, this.br * 1.9 * k, this.br * 0.5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = this.br * 0.12;
    ctx.stroke();
    ctx.restore();
  }

  // 공이 발밑에서 기다리면 '이쪽으로 뻥!' 점선 화살표가 골대로 깜빡인다.
  drawKickCue(ctx) {
    const b = this.ball;
    const { unit } = this.game;
    const tx = this.gx;
    const ty = this.goalLine + this.gh * 0.15;
    const cx = (b.x + tx) / 2;
    const cy = Math.min(b.y, ty) - unit * 0.05;
    const sx = b.x;
    const sy = b.y - this.br * 1.4;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(this.t * 3));
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineWidth = unit * 0.012;
    ctx.lineCap = 'round';
    ctx.setLineDash([unit * 0.02, unit * 0.025]);
    ctx.lineDashOffset = -this.t * unit * 0.1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // 화살촉
    const a = Math.atan2(ty - cy, tx - cx);
    const hs = unit * 0.03;
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a) * hs, ty + Math.sin(a) * hs);
    ctx.lineTo(tx + Math.cos(a + 2.4) * hs, ty + Math.sin(a + 2.4) * hs);
    ctx.lineTo(tx + Math.cos(a - 2.4) * hs, ty + Math.sin(a - 2.4) * hs);
    ctx.fill();
    ctx.restore();
  }
}

// 발이 '휙' 움직였는지: 최근 SWING_WINDOW 초 동안 움직인 거리·빠르기가 기준 이상이면 그 구간을 돌려준다.
function swing(hist, pt, now, sw, speed, move) {
  hist.pts.push({ x: pt.x, y: pt.y, t: now });
  while (hist.pts.length > 2 && now - hist.pts[0].t > SWING_WINDOW) hist.pts.shift();
  const a = hist.pts[0];
  const span = now - a.t;
  if (span < 0.03 || span > SWING_WINDOW * 2) return null;
  const dx = pt.x - a.x;
  const dy = pt.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < move * sw || d / span < speed * sw) return null;
  return { ax: a.x, ay: a.y, bx: pt.x, by: pt.y, dx, dy, d };
}

// 발(발끝·발목) 중 화면에서 가장 아래 높이. 안 보이면 null
function footY(pose) {
  const ys = [P.lAnkle, P.rAnkle, 31, 32].filter((i) => visible(pose[i], FOOT_VIS)).map((i) => pose[i].y);
  return ys.length ? Math.max(...ys) : null;
}

// 축구공: 하얀 공에 검은 오각형 무늬(rot 만큼 굴러간 모습)
function soccerBall(ctx, x, y, r, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.rotate(rot);
  const pent = (cx, cy, pr, a0) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i * Math.PI * 2) / 5;
      ctx.lineTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = COLORS.ink;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = r * 0.06;
  pent(0, 0, r * 0.34, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34);
    ctx.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
    ctx.stroke();
    pent(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.3, a + Math.PI / 5);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(61,44,46,0.6)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 작은 골대(설명 카드·메뉴 아이콘용). (x, y) = 골대 가운데 아래
function miniGoal(ctx, x, y, w, h, shake = 0) {
  ctx.save();
  ctx.fillStyle = 'rgba(200,200,210,0.35)';
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = 'rgba(120,120,130,0.6)';
  ctx.lineWidth = Math.max(1, w * 0.012);
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const gx = x - w / 2 + (i * w) / 8;
    ctx.moveTo(gx, y - h);
    ctx.quadraticCurveTo(gx, y - h / 2 - shake * h * 0.3 * Math.sin(i), gx, y);
  }
  for (let j = 1; j < 4; j++) {
    const gy = y - h + (j * h) / 4;
    ctx.moveTo(x - w / 2, gy);
    ctx.quadraticCurveTo(x, gy - shake * h * 0.35, x + w / 2, gy);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h);
  ctx.lineTo(x + w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.strokeStyle = 'rgba(61,44,46,0.35)';
  ctx.lineWidth = w * 0.06;
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = w * 0.04;
  ctx.stroke();
  ctx.restore();
}

// 놀이 설명: 친구가 발로 공을 뻥 차서 펭귄 골키퍼 옆으로 골인!
export const guide = {
  text: '공이 굴러오면 발로 뻥! 차서 골대에 넣어요. 골인!',
  demo: (ctx, s, t) => {
    const period = 3.2;
    const p = t % period;
    // 잔디
    ctx.fillStyle = 'rgba(126,206,98,0.55)';
    ctx.fillRect(-s * 8, -s * 1.3, s * 16, s * 7);
    const gx = s * 1.9;
    const gyBottom = -s * 1.1;
    const shake = p > 1.7 ? Math.max(0, 1 - (p - 1.7) / 0.9) * Math.cos((p - 1.7) * 25) : 0;
    miniGoal(ctx, gx, gyBottom, s * 5.0, s * 2.4, shake);
    // 펭귄 골키퍼는 공 반대쪽으로 몸을 기울인다.
    ctx.save();
    ctx.translate(gx - s * 1.3, gyBottom);
    ctx.rotate(p > 0.9 && p < 2.6 ? -0.35 : 0);
    penguin(ctx, 0, -s * 0.85, s * 0.7);
    ctx.restore();

    // 친구: 0.55~0.95초에 오른발로 뻥
    const kicking = p > 0.55 && p < 0.95;
    const kx = -s * 2.6;
    const ky = s * 1.3;
    kid(ctx, kx, ky, s, {
      hands: kicking ? [[-1.2, -0.3], [1.0, 0.0]] : [[-0.7, 0.4], [0.7, 0.4]],
      legUp: kicking ? 1 : 0,
    });
    // 공: 0~0.6초 굴러오고, 0.8~1.7초 날아가 골인, 그 뒤 그물 속
    const spot = [kx + s * 0.75, ky + s * 1.15];
    const into = [gx + s * 1.3, gyBottom - s * 1.2];
    let bx;
    let by;
    let r = s * 0.38;
    let rot = 0;
    if (p < 0.6) {
      const k = p / 0.6;
      bx = lerp(s * 0.5, spot[0], easeOut(k));
      by = lerp(s * 0.2, spot[1], k);
      r *= lerp(0.6, 1, k);
      rot = -k * 6;
    } else if (p < 0.8) {
      [bx, by] = spot;
    } else if (p < 1.7) {
      const k = (p - 0.8) / 0.9;
      const e = easeOut(k);
      bx = lerp(spot[0], into[0], e);
      by = lerp(spot[1], into[1], e) - Math.sin(Math.PI * k) * s * 1.6;
      r *= lerp(1, 0.55, e);
      rot = k * 10;
    } else {
      [bx, by] = [into[0], into[1] + Math.min(1, (p - 1.7) * 2) * s * 0.4];
      r *= 0.55;
    }
    soccerBall(ctx, bx, by, r, rot);
    if (p > 0.6 && p < 0.85) {
      // 뻥! 찬 자리 반짝
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + 0.3;
        star(ctx, spot[0] + Math.cos(a) * s * 0.6, spot[1] + Math.sin(a) * s * 0.6, s * 0.14, COLORS.yellow);
      }
    }
    if (p > 1.7 && p < 2.7) {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + p;
        star(ctx, into[0] + Math.cos(a) * s * 0.9, into[1] + Math.sin(a) * s * 0.7, s * 0.2, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// 메뉴 아이콘: 골대 앞에서 통통 튀는 축구공
export function menuIcon(ctx, r, t = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(126,206,98,0.7)';
  ctx.fillRect(-r, -r * 0.05, r * 2, r);
  ctx.restore();
  miniGoal(ctx, 0, -r * 0.05, r * 1.2, r * 0.55);
  const hop = Math.abs(Math.sin(t * 3)) * r * 0.14;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(r * 0.05, r * 0.66, r * 0.26 * (1 - hop / r), r * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  soccerBall(ctx, r * 0.05, r * 0.38 - hop, r * 0.28, t * 2);
}
