import { COLORS, star } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { bear } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { armPoint, drawAvatar, P, perPerson, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 10; // 한 단계에서 칠 공 수(별)
// 단계별 난이도: travel = 투수 손에서 타격 지점까지 공이 오는 시간(초), window = 공이 도착하는 순간 앞뒤로 이 시간(초) 안에 휘두르면 맞음
const LEVELS = [
  { travel: 2.4, window: 0.55 },
  { travel: 1.9, window: 0.45 },
  { travel: 1.55, window: 0.38 },
];
const WINDUP = 1.3; // 투수가 팔을 들어 던질 준비를 하는 시간(초) — 이때 '뿅' 소리로 미리 알려 준다
const REST = [1.0, 1.5]; // 다음 투구까지 쉬는 시간(초)
const NEAR = 4; // 원근감: 공이 타격 지점에서 이 배만큼 작게 출발해 점점 커진다
// 스윙 판정(어깨너비 기준이라 아이 키·거리와 무관). 손목이 몸 가운데에 대해 옆으로 움직인 빠르기로 본다.
const SWING_SPEED = 3.0; // 이 빠르기(어깨너비/초) 이상으로 손이 옆으로 움직이면 스윙
const HOMERUN_SPEED = 7.0; // 스윙 중 가장 빠른 순간이 이 빠르기 이상이면 홈런
const SPEED_WINDOW = 0.15; // 빠르기를 재는 구간(초) — 손 떨림·인식 흔들림은 이 구간에서 거의 상쇄된다
const SIDEWAYS = 0.5; // 옆 움직임이 위아래 움직임의 이 배 이상이어야 스윙(머리 긁기·만세는 제외)
const SWING_COOLDOWN = 0.5; // 한 번 휘두른 뒤 다음 스윙으로 세기까지(초)
const JUMP_LIMIT = 2.5; // 한 프레임에 손이 이만큼(어깨너비) 넘게 튀면 인식 오류로 보고 다시 잰다
const HIT_REACH = 2.4; // 손목·방망이 끝이 타격 지점에서 이 거리(어깨너비) 안이면 '공 근처에서 휘두름'(넉넉하게)
const LATE_GRACE = 0.9; // 공이 지나간 뒤 이 시간(초) 안의 스윙은 '조금 늦음'으로 안내
const TAP_HOMERUN = 0.12; // 터치로 칠 때 도착 순간 앞뒤 이 시간(초) 안이면 홈런
const TOGETHER = 0.9; // 두 손목 사이가 이 거리(어깨너비) 안이면 두 손으로 방망이를 잡은 것으로 그린다
const BAT_LEN = 1.5; // 방망이 길이(어깨너비 배)
const VOICE_GAP = 4; // 안내 음성 최소 간격(초)
const READY_VOICE_EVERY = 3; // 이 투구마다 한 번 "준비… 던져요!"
const MISS_VOICE_EVERY = 2; // 못 친 공 이 개마다 한 번 "괜찮아요, 다시 해 봐요!"
const IDLE_HINT_PITCHES = 3; // 이만큼 연속으로 아무도 안 휘두르면 방법을 다시 알려 준다
const HIT_LINES = ['딱! 안타!', '잘 쳤어요!', '멋져요!'];
const between = ([a, b]) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 그림 ----------

// 야구공. 실밥이 돌아가며 날아오는 느낌
export function baseball(ctx, x, y, r, spin = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.arc(r * 0.08, r * 0.1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#D9D4CC';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(spin);
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-r * 1.25, 0, r * 0.8, -0.75, 0.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 1.25, 0, r * 0.8, Math.PI - 0.75, Math.PI + 0.75);
  ctx.stroke();
  ctx.restore();
}

// 장난감 방망이. (x, y) = 손잡이(손 위치), angle 방향으로 뻗는다. len = 길이
export function bat(ctx, x, y, angle, len, grip = COLORS.blue) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineJoin = 'round';
  // 몸통: 손잡이는 가늘고 끝으로 갈수록 굵어진다.
  ctx.fillStyle = '#F2C27B';
  ctx.strokeStyle = '#B9803E';
  ctx.lineWidth = Math.max(1.5, len * 0.022);
  ctx.beginPath();
  ctx.moveTo(-len * 0.12, -len * 0.035);
  ctx.lineTo(len * 0.4, -len * 0.045);
  ctx.quadraticCurveTo(len * 0.62, -len * 0.1, len * 0.92, -len * 0.1);
  ctx.arc(len * 0.92, 0, len * 0.1, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(len * 0.62, len * 0.1, len * 0.4, len * 0.045);
  ctx.lineTo(-len * 0.12, len * 0.035);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 반짝임
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineCap = 'round';
  ctx.lineWidth = len * 0.025;
  ctx.beginPath();
  ctx.moveTo(len * 0.55, -len * 0.05);
  ctx.lineTo(len * 0.9, -len * 0.06);
  ctx.stroke();
  // 손잡이 테이프(아이 색)와 끝 동그라미
  ctx.fillStyle = grip;
  ctx.beginPath();
  ctx.roundRect(-len * 0.12, -len * 0.045, len * 0.3, len * 0.09, len * 0.03);
  ctx.fill();
  ctx.fillStyle = '#B9803E';
  ctx.beginPath();
  ctx.arc(-len * 0.14, 0, len * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 포수 글러브(놓친 공을 받는 곳)
export function mitt(ctx, x, y, s, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 + squash * 0.12, 1 - squash * 0.12);
  ctx.fillStyle = '#C9733A';
  ctx.strokeStyle = '#8E4A1F';
  ctx.lineWidth = s * 0.08;
  // 엄지
  ctx.beginPath();
  ctx.ellipse(-s * 0.85, s * 0.15, s * 0.3, s * 0.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.85, s * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#E09A5E';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.5, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // 손가락 줄
  ctx.strokeStyle = '#8E4A1F';
  ctx.lineWidth = s * 0.05;
  ctx.lineCap = 'round';
  for (const dx of [-0.35, 0, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(dx * s, -s * 0.85);
    ctx.lineTo(dx * s * 0.8, -s * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

// 야구 모자를 쓴 곰 투수. wind(0~1) = 팔을 뒤로 든 정도, thrown(0~1) = 공을 던진 직후 팔이 앞으로 나온 정도
function pitcher(ctx, x, y, s, { wind = 0, thrown = 0, ball = true, t = 0 } = {}) {
  ctx.save();
  const bob = Math.sin(t * 3) * s * 0.03 * (1 - wind);
  // 마운드
  ctx.fillStyle = 'rgba(205,150,95,0.9)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 1.95, s * 1.9, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - s * 0.35, y + s * 1.88, s * 0.7, s * 0.12);
  ctx.translate(0, bob);
  // 몸통(유니폼)
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#E3E3E3';
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.ellipse(x, y + s * 1.25, s * 0.78, s * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.ellipse(x, y + s * 1.3, s * 0.22, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // 글러브 낀 손(왼쪽)
  ctx.strokeStyle = '#9C6B4A';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y + s * 0.95);
  ctx.lineTo(x - s * 0.95, y + s * (1.35 - wind * 0.4));
  ctx.stroke();
  mitt(ctx, x - s * 1.0, y + s * (1.4 - wind * 0.4), s * 0.3);
  // 던지는 팔(오른쪽): 쉴 때 아래 → 와인드업 때 머리 뒤로 → 던지면 앞으로
  const rest = 0.9;
  const back = -2.3;
  const front = 0.3;
  const a = thrown > 0 ? back + (front - back) * Math.min(1, thrown * 1.6) : rest + (back - rest) * wind;
  const sx = x + s * 0.55;
  const sy = y + s * 0.95;
  const hx = sx + Math.cos(a) * s * 0.85;
  const hy = sy + Math.sin(a) * s * 0.85;
  ctx.strokeStyle = '#9C6B4A';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = '#9C6B4A';
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.19, 0, Math.PI * 2);
  ctx.fill();
  if (ball && thrown === 0) baseball(ctx, hx, hy - s * 0.05, s * 0.17);
  // 머리와 모자
  bear(ctx, x, y, s * 0.82);
  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.22, s * 0.66, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#D9434A';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.1, y - s * 0.22, s * 0.85, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.88, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 아이 머리 위에서 콩콩 뛰는 '네 차례!' 표시
export function turnMarker(ctx, x, y, s, color, t) {
  const hop = Math.abs(Math.sin(t * 5)) * s * 0.5;
  ctx.save();
  ctx.translate(x, y - hop);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.18;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.6);
  ctx.lineTo(s * 0.7, -s * 0.6);
  ctx.lineTo(0, s * 0.45);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

// ---------- 놀이 ----------

// 야구 공 치기: 곰 투수가 던진 공이 아이 가슴 앞에 올 때 방망이(손)를 옆으로 휙! 휘둘러 친다.
// 아이가 두 명이면 한 번씩 번갈아 공을 던져 준다(차례인 아이 머리 위에 표시).
export class BaseballScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
    this.personState = new Map();
    this.people = [];
    this.ids = [];
  }

  avatarColorOf(person) {
    return PLAYER_COLORS[this.rank(person.id)];
  }

  // 아이 id 순서대로 0, 1 (아바타 색·방망이 손잡이 색)
  rank(id) {
    return Math.max(0, this.ids.indexOf(id)) % 2;
  }

  onResize() {
    const { w, unit, zone: z } = this.game;
    this.pitchS = unit * 0.06;
    this.pitchX = w / 2;
    this.pitchY = z.y + z.h * 0.32;
    this.mittS = unit * 0.05;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.t = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.personState = new Map();
    this.people = [];
    this.ids = [];
    this.turn = 0;
    this.pitches = 0;
    this.misses = 0;
    this.quietPitches = 0;
    this.lastVoice = -Infinity;
    this.ball = null;
    this.fly = null;
    this.spot = null;
    this.r1 = this.game.unit * 0.05;
    this.thrownT = 0;
    this.catchT = 0;
    this.tapSwing = false;
    this.stats = { pitches: 0, hits: 0, homeRuns: 0, swings: 0, early: 0, late: 0 };
    this.after(speak('야구 놀이! 공이 가까이 오면 방망이를 휙! 휘둘러요.'), () => this.rest(0.5));
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

  // 안내 음성(너무 자주 말하지 않게)
  say(text, force = false) {
    if (!force && this.t - this.lastVoice < VOICE_GAP) return;
    this.lastVoice = this.t;
    speak(text);
  }

  get cfg() {
    return LEVELS[this.level - 1];
  }

  // 보호자·PC 테스트용: 공이 올 때 화면을 누르면 휘두른 것으로 친다.
  onTap() {
    this.tapSwing = true;
  }

  update(dt, input) {
    this.t += dt;
    this.stateT -= dt;
    this.thrownT = Math.max(0, this.thrownT - dt);
    this.catchT = Math.max(0, this.catchT - dt);
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    this.people = perPerson(this.personState, input.people);
    this.ids = input.people.map((p) => p.id).sort((a, b) => a - b);
    const swings = this.detectSwings(dt);
    if (this.tapSwing) {
      swings.push({ tap: true });
      this.tapSwing = false;
    }
    this.updateSpot(dt);

    if (this.state === 'rest' && this.stateT <= 0) this.windup();
    else if (this.state === 'windup' && this.stateT <= 0) this.release();
    else if (this.state === 'pitch' || this.state === 'miss') this.updateBall();
    else if (this.state === 'hit') this.updateFly(dt);
    else if (this.state === 'celebrate') {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) this.nextLevel();
    }
    if (this.fly && this.state !== 'hit') this.updateFly(dt);

    for (const sw of swings) this.judge(sw);
  }

  // 아이마다 양 손목의 '몸 가운데 기준' 옆 움직임 빠르기를 재서 스윙을 찾는다.
  // 몸 전체가 옆으로 걸어가도 손은 몸과 같이 움직이므로 스윙이 아니다. 가만히 서 있으면 빠르기가 0에 가깝다.
  detectSwings(dt) {
    const out = [];
    for (const p of this.people) {
      const s = p.state;
      s.hist ??= { l: [], r: [] };
      s.cool = Math.max(0, (s.cool ?? 0) - dt);
      const sh = shoulders(p.pose);
      if (p.lost || !sh) {
        s.hist.l.length = 0;
        s.hist.r.length = 0;
        continue;
      }
      this.trackBatTip(p, sh);
      for (const side of ['l', 'r']) {
        const hist = s.hist[side];
        const pt = armPoint(p.pose, side);
        if (!pt) {
          hist.length = 0;
          continue;
        }
        const x = (pt.x - sh.mx) / sh.sw;
        const y = (pt.y - sh.my) / sh.sw;
        const last = hist[hist.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y) > JUMP_LIMIT) hist.length = 0;
        hist.push({ t: this.t, x, y, px: pt.x, py: pt.y });
        while (hist.length && this.t - hist[0].t > 0.4) hist.shift();
        const v = this.handVelocity(hist);
        if (!v || s.cool > 0) continue;
        if (Math.abs(v.vx) < SWING_SPEED || Math.abs(v.vx) < Math.abs(v.vy) * SIDEWAYS) continue;
        s.cool = SWING_COOLDOWN;
        s.batSide = side;
        s.swing = { t: this.t, side, peak: Math.abs(v.vx), dir: Math.sign(v.vx) };
        out.push({ id: p.id, swing: s.swing, points: [pt, { x: v.ref.px, y: v.ref.py }, s.tip].filter(Boolean), sh });
      }
      // 홈런 판정용: 휘두르기 시작한 뒤 잠깐 동안 가장 빠른 순간을 기록
      if (s.swing && this.t - s.swing.t < SPEED_WINDOW) s.swing.peak = Math.max(s.swing.peak, this.handSpeed(s.hist[s.swing.side]));
    }
    return out;
  }

  // 지난 SPEED_WINDOW 초 동안의 평균 속도(어깨너비/초). 기록이 짧으면 null
  handVelocity(hist) {
    if (hist.length < 2) return null;
    const now = hist[hist.length - 1];
    const ref = hist.find((h) => now.t - h.t <= SPEED_WINDOW + 1e-6);
    const span = now.t - ref.t;
    if (span < SPEED_WINDOW * 0.5) return null;
    return { vx: (now.x - ref.x) / span, vy: (now.y - ref.y) / span, ref };
  }

  handSpeed(hist) {
    const v = this.handVelocity(hist);
    return v ? Math.abs(v.vx) : 0;
  }

  // 방망이 위치(손잡이·각도·끝)를 계산해 그리기와 '공 근처' 판정에 쓴다.
  trackBatTip(p, sh) {
    const s = p.state;
    const pose = p.pose;
    const lw = pose[P.lWrist];
    const rw = pose[P.rWrist];
    const lv = visible(lw, 0.3);
    const rv = visible(rw, 0.3);
    let grip = null;
    let from = null;
    if (lv && rv && Math.hypot(lw.x - rw.x, lw.y - rw.y) < sh.sw * TOGETHER) {
      // 두 손으로 잡음: 두 손목 가운데에서 팔뚝 방향으로
      grip = { x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2 };
      const le = pose[P.lElbow];
      const re = pose[P.rElbow];
      from = visible(le, 0.3) && visible(re, 0.3) ? { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 } : { x: sh.mx, y: sh.my };
    } else {
      // 한 손: 마지막으로 휘두른 손(없으면 몸에서 더 먼 손)
      let side = s.batSide;
      if (!side || !(side === 'l' ? lv : rv)) {
        if (lv && rv) side = Math.abs(lw.x - sh.mx) > Math.abs(rw.x - sh.mx) ? 'l' : 'r';
        else side = lv ? 'l' : rv ? 'r' : null;
      }
      if (side) {
        grip = side === 'l' ? lw : rw;
        const e = pose[side === 'l' ? P.lElbow : P.rElbow];
        from = visible(e, 0.3) ? e : pose[side === 'l' ? P.lShoulder : P.rShoulder];
      }
    }
    if (!grip) {
      s.bat = null;
      s.tip = null;
      return;
    }
    let angle = Math.atan2(grip.y - from.y, grip.x - from.x);
    if (Math.hypot(grip.x - from.x, grip.y - from.y) < sh.sw * 0.15) angle = s.bat?.angle ?? -Math.PI / 2;
    // 각도가 덜덜 떨리지 않게 살짝 부드럽게
    if (s.bat) angle = s.bat.angle + Math.atan2(Math.sin(angle - s.bat.angle), Math.cos(angle - s.bat.angle)) * 0.6;
    const len = sh.sw * BAT_LEN;
    s.bat = { x: grip.x, y: grip.y, angle, len };
    s.tip = { x: grip.x + Math.cos(angle) * len * 0.85, y: grip.y + Math.sin(angle) * len * 0.85 };
    s.tips ??= [];
    s.tips.push({ t: this.t, x: s.tip.x, y: s.tip.y });
    while (s.tips.length && this.t - s.tips[0].t > 0.25) s.tips.shift();
  }

  // 차례인 아이의 가슴 앞(화면 가운데 쪽으로 조금)을 공이 도착할 지점으로 잡는다.
  targetPerson() {
    return this.people.find((p) => p.id === this.targetId && !p.lost) ?? null;
  }

  updateSpot(dt) {
    const { w, unit, zone: z, homeButton: hb } = this.game;
    const p = this.targetPerson();
    const sh = p && shoulders(p.pose);
    let x;
    let y;
    let r1;
    if (sh) {
      this.side ??= sh.mx < w / 2 ? 1 : -1;
      x = sh.mx + this.side * sh.sw * 0.6;
      y = sh.my + sh.sw * 0.45;
      r1 = clamp(sh.sw * 0.4, unit * 0.035, unit * 0.075);
    } else {
      x = w / 2 + z.w * 0.08;
      y = z.y + z.h * 0.62;
      r1 = unit * 0.05;
    }
    r1 = this.r1 + (r1 - this.r1) * Math.min(1, dt * 4);
    x = clamp(x, z.x + r1 * 1.5, z.x + z.w - r1 * 1.5);
    y = clamp(y, this.pitchY + this.pitchS * 3, z.y + z.h - r1 * 1.5);
    // 집 버튼과 겹치지 않게
    if (hb && Math.hypot(x - hb.x, y - hb.y) < hb.r + r1 * 2) x = hb.x + hb.r + r1 * 2;
    if (!this.spot) this.spot = { x, y };
    const k = Math.min(1, dt * 6);
    this.spot.x += (x - this.spot.x) * k;
    this.spot.y += (y - this.spot.y) * k;
    this.r1 = r1;
    // 포수 글러브: 타격 지점 아래
    const ms = this.mittS;
    let mx = this.spot.x;
    if (hb && Math.abs(z.y + z.h - ms * 1.2 - hb.y) < hb.r + ms * 1.5 && mx < hb.x + hb.r * 1.3 + ms * 1.2) mx = hb.x + hb.r * 1.3 + ms * 1.2;
    this.mitt = { x: mx, y: z.y + z.h - ms * 1.2 };
  }

  rest(time = between(REST)) {
    this.state = 'rest';
    this.stateT = time;
    this.ball = null;
  }

  // 차례인 아이를 정하고 투수가 팔을 든다(뿅! 소리와 가끔 "준비… 던져요!").
  windup() {
    const ids = this.people.filter((p) => !p.lost).map((p) => p.id).sort((a, b) => a - b);
    this.targetId = ids.length ? ids[this.turn % ids.length] : null;
    this.turn++;
    this.side = undefined;
    this.state = 'windup';
    this.stateT = WINDUP;
    this.pitches++;
    this.stats.pitches++;
    this.pitchSwung = false;
    this.feedback = null;
    sfx.peek();
    if (this.pitches === 1 || this.pitches % READY_VOICE_EVERY === 0) this.say('준비… 던져요!', true);
  }

  release() {
    const s = this.pitchS;
    this.state = 'pitch';
    this.thrownT = 0.4;
    this.ball = { start: this.t, arrive: this.t + this.cfg.travel, from: { x: this.pitchX + s * 0.6, y: this.pitchY + s * 0.5 }, x: 0, y: 0, r: 0, spin: 0 };
    sfx.bloop();
    this.updateBall();
  }

  // 공 위치: 투수 손 → 타격 지점(점점 커지며) → 지나가면 포수 글러브로
  updateBall() {
    const b = this.ball;
    const { unit } = this.game;
    const d = this.t - b.arrive;
    b.spin = this.t * 10;
    if (d <= 0) {
      const k = clamp((this.t - b.start) / this.cfg.travel, 0, 1);
      const z = 1 + (NEAR - 1) * (1 - k); // 멀수록 큼
      const f = (NEAR / z - 1) / (NEAR - 1); // 화면상 진행(처음엔 천천히, 가까이 올수록 빠르게)
      b.x = b.from.x + (this.spot.x - b.from.x) * f;
      b.y = b.from.y + (this.spot.y - b.from.y) * f - Math.sin(Math.PI * f) * unit * 0.05;
      b.r = this.r1 / z;
    } else {
      const toMitt = this.cfg.window + 0.15;
      const q = Math.min(1, d / toMitt);
      b.x = this.spot.x + (this.mitt.x - this.spot.x) * q;
      b.y = this.spot.y + (this.mitt.y - this.spot.y) * q;
      b.r = this.r1 * (1 - q * 0.35); // 글러브 속으로 쏙
      if (q >= 1 && !b.caught) {
        b.caught = true;
        this.catchT = 0.3;
        sfx.drum();
      }
    }
    if (this.state === 'pitch' && d > this.cfg.window) this.state = 'miss';
    if (this.state === 'miss' && d > this.cfg.window + LATE_GRACE) this.missed();
  }

  // 못 쳤을 때: 혼내지 않고 가끔 응원만
  missed() {
    this.misses++;
    this.quietPitches = this.pitchSwung ? 0 : this.quietPitches + 1;
    if (this.quietPitches >= IDLE_HINT_PITCHES) {
      this.quietPitches = 0;
      this.say('공이 가까이 오면 방망이를 옆으로 휙! 휘둘러 봐요!', true);
    } else if (!this.feedback && this.misses % MISS_VOICE_EVERY === 0) {
      this.say('괜찮아요, 다시 해 봐요!');
    }
    this.rest();
  }

  // 스윙 한 번 판정: 공이 도착할 즈음 + 공 근처면 딱! 너무 빠르거나 늦으면 부드럽게 다시 안내.
  judge(sw) {
    sfx.whoosh();
    const live = this.state === 'windup' || this.state === 'pitch' || this.state === 'miss';
    if (!live) return;
    this.stats.swings++;
    this.pitchSwung = true;
    const near = sw.tap || this.nearSpot(sw);
    if (!near) return;
    const d = this.state === 'windup' ? -Infinity : this.t - this.ball.arrive;
    const win = this.cfg.window;
    if (this.state === 'pitch' && Math.abs(d) <= win) {
      this.hit(sw, d);
    } else if (d < -win) {
      this.stats.early++;
      if (!this.feedback) {
        this.feedback = 'early';
        this.say('조금 더 기다렸다가 휙!');
      }
    } else if (d > win) {
      this.stats.late++;
      if (!this.feedback) {
        this.feedback = 'late';
        this.say('조금 더 빨리!');
      }
    }
  }

  nearSpot(sw) {
    const reach = sw.sh.sw * HIT_REACH;
    return sw.points.some((q) => Math.hypot(q.x - this.spot.x, q.y - this.spot.y) < reach);
  }

  hit(sw, d) {
    const { unit, particles, w, zone: z } = this.game;
    const b = this.ball;
    this.state = 'hit';
    this.stateT = 99;
    this.quietPitches = 0;
    this.stats.hits++;
    sfx.bonk();
    particles.burst(b.x, b.y, { count: 22, colors: [COLORS.yellow, '#fff', COLORS.orange], speed: unit * 0.55, size: unit * 0.018, shape: 'star', gravity: 200 });
    particles.ring(b.x, b.y, { color: '#fff', size: b.r * 3 });
    const dir = b.x < w / 2 ? 1 : -1; // 대체로 운동장 가운데 쪽으로
    this.fly = {
      x: b.x,
      y: b.y,
      r: b.r,
      vx: dir * unit * (0.15 + Math.random() * 0.35),
      // 안타는 외야(화면 위쪽)까지 올라갔다 떨어지는 높이로
      vy: -Math.sqrt(2 * unit * 1.1 * Math.max(unit * 0.1, b.y - (z.y + z.h * 0.1))),
      g: unit * 1.1,
      t: 0,
      kind: 'pending',
      swing: sw.swing,
      tapPerfect: sw.tap && Math.abs(d) <= TAP_HOMERUN,
      trailT: 0,
    };
    this.ball = null;
    this.pulse[this.score] = 1;
    this.score++;
  }

  // 맞은 공이 하늘 멀리 날아간다. 휘두른 빠르기(스윙 중 가장 빠른 순간)로 안타/홈런을 정한다.
  updateFly(dt) {
    const f = this.fly;
    if (!f) {
      if (this.state === 'hit' && this.stateT <= 0) this.afterHit();
      return;
    }
    const { unit, particles, zone: z } = this.game;
    f.t += dt;
    if (f.kind === 'pending' && f.t >= SPEED_WINDOW) {
      const homer = f.swing ? f.swing.peak >= HOMERUN_SPEED : f.tapPerfect;
      f.kind = homer ? 'homerun' : 'hit';
      if (homer) {
        this.stats.homeRuns++;
        f.vy = -unit * 2.1;
        f.g = unit * 0.3;
        f.vx *= 0.6;
        sfx.fanfare();
        this.say('홈런!', true);
        this.stateT = 2.4;
      } else {
        sfx.success();
        if (Math.random() < 0.6) this.say(HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)], true);
        this.stateT = 1.6;
      }
    }
    f.vy += f.g * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.r *= Math.exp(-(f.kind === 'homerun' ? 1.2 : 1.5) * dt);
    f.trailT -= dt;
    if (f.trailT <= 0) {
      f.trailT = 0.05;
      particles.burst(f.x, f.y, { count: 2, colors: [COLORS.yellow, '#fff'], speed: unit * 0.05, size: unit * 0.01, shape: 'star', gravity: 0, life: 0.5 });
    }
    if (f.kind === 'homerun' && (f.fireT = (f.fireT ?? 0) - dt) <= 0) {
      f.fireT = 0.3;
      firework(this.game);
    }
    // 안타: 운동장에 떨어지면 반짝, 홈런: 화면 밖으로
    const landY = z.y + z.h * 0.24;
    if (f.kind === 'hit' && f.vy > 0 && f.y > landY) {
      particles.burst(f.x, f.y, { count: 12, colors: [COLORS.yellow, '#fff'], speed: unit * 0.2, size: unit * 0.014, shape: 'star', gravity: 150 });
      sfx.sparkle();
      this.fly = null;
    } else if (f.y < -f.r * 2 || f.t > 3) {
      this.fly = null;
    }
    if (this.state === 'hit' && this.stateT <= 0) this.afterHit();
  }

  afterHit() {
    if (this.score >= GOAL) this.celebrate();
    else this.rest();
  }

  // 한 단계 성공: 축하하고 다음 단계로. 3단계까지 모두 하면 크게 축하하고 1단계부터 다시.
  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 4;
    this.fireT = 0;
    sfx.fanfare();
    this.say(last ? '3단계까지 모두 성공! 최고의 야구 선수예요!' : `잘 쳤어요! ${this.level + 1}단계! 공이 조금 더 빨라져요!`, true);
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    this.level = this.level >= LEVELS.length ? 1 : this.level + 1;
    this.rest(1.2);
  }

  // ---------- 그리기 ----------

  draw(ctx) {
    const { unit, time } = this.game;
    this.drawField(ctx);

    const pitchK = this.state === 'windup' ? 1 - Math.max(0, this.stateT) / WINDUP : 0;
    pitcher(ctx, this.pitchX, this.pitchY, this.pitchS, {
      wind: Math.min(1, pitchK * 1.4),
      thrown: this.thrownT > 0 ? 1 - this.thrownT / 0.4 : 0,
      ball: this.state !== 'pitch' && this.state !== 'miss' && this.state !== 'hit',
      t: time,
    });

    // 포수 글러브: 공이 오는 동안·놓친 공을 받을 때
    if (this.mitt && (this.state === 'pitch' || this.state === 'miss')) {
      ctx.save();
      ctx.globalAlpha = this.state === 'miss' ? 1 : 0.55;
      mitt(ctx, this.mitt.x, this.mitt.y, this.mittS, this.catchT / 0.3);
      ctx.restore();
    }

    // 아이 몸(운동장 그림 위에 다시 그려 잘 보이게)
    for (const p of this.people) drawAvatar(ctx, p.pose, this.avatarColorOf(p));

    const target = this.targetPerson();
    const color = target ? this.avatarColorOf(target) : PLAYER_COLORS[0];
    if (this.state === 'windup' || this.state === 'pitch') this.drawSpot(ctx, color);
    if (target && (this.state === 'windup' || this.state === 'pitch') && this.people.length > 1) {
      const sh = shoulders(target.pose);
      const nose = target.pose[P.nose];
      if (sh) turnMarker(ctx, sh.mx, (visible(nose, 0.3) ? nose.y : sh.my - sh.sw * 0.8) - sh.sw * 0.95, sh.sw * 0.28, color, time);
    }

    for (const p of this.people) this.drawBat(ctx, p);

    if (this.ball) baseball(ctx, this.ball.x, this.ball.y, this.ball.r, this.ball.spin);
    if (this.fly) baseball(ctx, this.fly.x, this.fly.y, Math.max(unit * 0.006, this.fly.r), this.t * 14);

    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  // 운동장: 하늘, 잔디 줄무늬, 흙 내야와 베이스(카메라 속 아이가 비쳐 보이게 반투명)
  drawField(ctx) {
    const { w, unit, zone: z, time } = this.game;
    const horizon = z.y + z.h * 0.2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    ctx.fillStyle = 'rgba(178,224,255,0.5)';
    ctx.fillRect(z.x, z.y, z.w, horizon - z.y);
    // 구름
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const cx = z.x + ((((i * 0.37 + time * 0.012) % 1) + 1) % 1) * z.w;
      const cy = z.y + z.h * (0.06 + (i % 2) * 0.06);
      const r = unit * 0.025;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx + r * 1.1, cy - r * 0.4, r * 1.2, 0, Math.PI * 2);
      ctx.arc(cx + r * 2.2, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 외야 담장
    ctx.fillStyle = 'rgba(46,140,90,0.65)';
    ctx.fillRect(z.x, horizon - unit * 0.025, z.w, unit * 0.025);
    // 잔디 줄무늬(가까울수록 넓게)
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const a = horizon + (z.y + z.h - horizon) * ((i / bands) ** 1.4);
      const b = horizon + (z.y + z.h - horizon) * (((i + 1) / bands) ** 1.4);
      ctx.fillStyle = i % 2 ? 'rgba(140,208,120,0.5)' : 'rgba(120,196,104,0.5)';
      ctx.fillRect(z.x, a, z.w, b - a + 1);
    }
    // 흙 내야(다이아몬드)
    const home = { x: w / 2, y: z.y + z.h * 1.08 };
    const second = { x: w / 2, y: horizon + z.h * 0.025 };
    const midY = z.y + z.h * 0.55;
    const first = { x: w / 2 + z.w * 0.46, y: midY };
    const third = { x: w / 2 - z.w * 0.46, y: midY };
    ctx.fillStyle = 'rgba(226,178,120,0.45)';
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(first.x, first.y);
    ctx.quadraticCurveTo(w / 2 + z.w * 0.3, second.y - z.h * 0.05, second.x, second.y - z.h * 0.04);
    ctx.quadraticCurveTo(w / 2 - z.w * 0.3, second.y - z.h * 0.05, third.x, third.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(130,200,112,0.45)';
    const k = 0.72;
    const mid = { x: w / 2, y: (home.y + second.y) / 2 };
    ctx.beginPath();
    for (const q of [home, first, second, third]) ctx.lineTo(mid.x + (q.x - mid.x) * k, mid.y + (q.y - mid.y) * k);
    ctx.closePath();
    ctx.fill();
    // 흰 선과 베이스
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = unit * 0.006;
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(first.x + (first.x - home.x) * 0.6, first.y + (first.y - home.y) * 0.6);
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(third.x + (third.x - home.x) * 0.6, third.y + (third.y - home.y) * 0.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const q of [first, second, third]) {
      const bs = unit * 0.018;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - bs * 0.6);
      ctx.lineTo(q.x + bs, q.y);
      ctx.lineTo(q.x, q.y + bs * 0.6);
      ctx.lineTo(q.x - bs, q.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 공이 도착할 자리: 아이 색 동그라미 + 공이 가까워질수록 줄어드는 고리(언제 휘두를지 알 수 있게)
  drawSpot(ctx, color) {
    if (!this.spot) return;
    const { x, y } = this.spot;
    const r = this.r1;
    let k = 0;
    if (this.state === 'pitch') k = clamp((this.t - this.ball.start) / this.cfg.travel, 0, 1);
    const now = this.state === 'pitch' && Math.abs(this.t - this.ball.arrive) <= this.cfg.window;
    ctx.save();
    ctx.fillStyle = now ? 'rgba(255,210,63,0.55)' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([r * 0.3, r * 0.25]);
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.14;
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.state === 'pitch') {
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.strokeStyle = now ? COLORS.yellow : color;
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.25 + 2.5 * (1 - k)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBat(ctx, p) {
    const s = p.state;
    if (!s.bat || p.lost) return;
    // 휘두른 직후엔 방망이 끝이 지나간 길에 '휙' 자국
    if (s.swing && this.t - s.swing.t < 0.35 && s.tips?.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.6 * (1 - (this.t - s.swing.t) / 0.35);
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.bat.len * 0.12;
      ctx.beginPath();
      for (const q of s.tips) ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.restore();
    }
    bat(ctx, s.bat.x, s.bat.y, s.bat.angle, s.bat.len, this.avatarColorOf(p));
  }
}

// ---------- 놀이 설명 ----------

const loop = (t, period) => (t % period) / period;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export const guide = {
  text: '곰 투수가 공을 던지면, 공이 가까이 올 때 방망이를 휙! 휘둘러서 딱! 쳐요.',
  demo: (ctx, s, t) => {
    const p = loop(t, 3.2);
    // 곰 투수(오른쪽 위)
    const px = s * 3.6;
    const py = -s * 2.0;
    const wind = p < 0.3 ? ease(p / 0.3) : 0;
    const thrown = p >= 0.3 && p < 0.45 ? (p - 0.3) / 0.15 : 0;
    pitcher(ctx, px, py, s * 0.85, { wind, thrown, ball: p < 0.3 || p > 0.95, t });

    // 아이(왼쪽): 방망이를 어깨 위에 들고 기다리다가 공이 오면 옆으로 휘두른다.
    const kx = -s * 2.6;
    const ky = s * 0.9;
    const swing = p < 0.66 ? 0 : p < 0.74 ? ease((p - 0.66) / 0.08) : 1;
    const back = [-0.75, -0.75];
    const front = [0.95, -0.35];
    const hx = lerp(back[0], front[0], swing);
    const hy = lerp(back[1], front[1], swing);
    kid(ctx, kx, ky, s, { hands: [[hx - 0.1, hy + 0.05], [hx + 0.1, hy - 0.05]], front: true });
    const angle = lerp(-Math.PI * 0.62, -Math.PI * 0.02, swing);
    if (swing > 0 && swing < 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(61,44,46,0.18)';
      ctx.lineWidth = s * 0.25;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(kx + hx * s, ky + hy * s, s * 1.6, -Math.PI * 0.62, angle);
      ctx.stroke();
      ctx.restore();
    }
    bat(ctx, kx + hx * s, ky + hy * s, angle, s * 1.9, COLORS.blue);

    // 공: 투수 → 아이 앞(점점 커짐) → 딱! 맞고 멀리
    const hitX = kx + s * 1.9;
    const hitY = ky - s * 0.45;
    const fromX = px + s * 0.4;
    const fromY = py + s * 0.4;
    if (p >= 0.3 && p < 0.72) {
      const k = (p - 0.3) / 0.42;
      const z = 1 + 3 * (1 - k);
      const f = (4 / z - 1) / 3;
      baseball(ctx, lerp(fromX, hitX, f), lerp(fromY, hitY, f) - Math.sin(Math.PI * f) * s * 0.4, (s * 0.38) / z, t * 10);
    } else if (p >= 0.72) {
      const k = (p - 0.72) / 0.28;
      if (k < 0.3) {
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          star(ctx, hitX + Math.cos(a) * s * 0.7, hitY + Math.sin(a) * s * 0.7, s * 0.2, i % 2 ? '#fff' : COLORS.yellow, i % 2 ? COLORS.yellow : null);
        }
      }
      baseball(ctx, lerp(hitX, s * 0.6, k), hitY - Math.sin(k * Math.PI * 0.6) * s * 3.2, s * 0.38 * (1 - k * 0.75), t * 14);
    }
  },
};

// 메뉴 아이콘: 방망이와 날아오는 야구공
export function menuIcon(ctx, r, t = 0) {
  const swing = Math.sin(t * 3) * 0.08;
  bat(ctx, -r * 0.42, r * 0.48, -Math.PI * 0.3 + swing, r * 0.95, COLORS.blue);
  const bob = Math.sin(t * 4) * r * 0.04;
  ctx.save();
  ctx.strokeStyle = 'rgba(61,44,46,0.25)';
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = 'round';
  for (const k of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * (0.66 - Math.abs(k) * 0.06), r * (0.12 + k * 0.13) + bob);
    ctx.lineTo(r * (0.8 - Math.abs(k) * 0.06), r * (0.12 + k * 0.13) + bob);
    ctx.stroke();
  }
  ctx.restore();
  baseball(ctx, r * 0.36, r * 0.12 + bob, r * 0.22, 0.6);
}
