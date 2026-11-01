import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { duck } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { perPerson, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 5; // 구멍 다섯 개에 넣으면 크게 축하
// ---- 스윙 판정(모두 어깨너비 sw 배, 추정값: 실제 아이로 조정 필요) ----
const HANDS_TOGETHER = 0.9; // 두 손목 사이가 이보다 가까우면 '두 손으로 막대를 잡은 것'
const SWING_SPEED = 2.8; // 모은 손이 이 속도(sw/초) 이상으로 움직여야 스윙. 가만히 서 있거나 천천히 움직이면 절대 안 맞음
const STRONG_SPEED = 6; // 이 속도면 한 번에 구멍까지 굴러감(힘 1.0). 느리면 그만큼 덜 굴러간다
const MAX_POWER = 1.6; // 힘 상한(너무 세면 깃대에 '통' 맞고 들어감)
const FLAG_BONK_POWER = 1.25; // 남은 거리보다 이만큼 이상 세면 깃대를 맞고 들어간다
const LOW = 0.6; // 손이 어깨보다 이만큼 아래(가슴 아래)에 있어야 '낮은 스윙'
const SIDE = 1.4; // 손이 몸 가운데에서 이만큼 안쪽(공 앞)을 지나야 한다
const TRAVEL = 0.9; // 최근 0.35초 동안 손이 이만큼 이상 움직여야 한다(인식 튐 방지)
const SPEED_WINDOW = 0.1; // 속도를 재는 시간 간격(초). 한 프레임 흔들림에 속지 않게
const MAX_STEP_SHARE = 0.6; // 최근 이동 거리 중 한 프레임 이동이 이 비율을 넘으면 인식 튐으로 보고 무시
const PEAK_WAIT = 0.15; // 스윙이 시작되면 이 시간(초) 동안 가장 빠른 속도를 힘으로 잡는다
// 너그러운 대안: 오래 못 치면 한 손으로 휙 휘둘러도 인정(두 손 모으기가 어려운 아이용)
const ONE_HAND_AFTER = 12; // 이 시간(초) 동안 못 치면 한 손 스윙도 받는다
const ONE_HAND_SPEED = 1.4; // 한 손일 때는 SWING_SPEED 의 이 배 이상 빨라야 한다
const OTHER_KID_AFTER = 8; // 차례인 아이가 이 시간(초) 동안 못 치면 다른 아이 스윙도 인정
const MAGIC_AFTER = 3; // 한 구멍에서 이만큼 쳐도 안 들어가면 마법처럼 데굴데굴 쏙
const APART_HINT_AFTER = 2.5; // 손을 떨어뜨린 채 이만큼(초) 지나면 "두 손을 모아요" 안내
const HINT_GAP = 9; // 다시 안내하는 음성 최소 간격(초)
const IDLE_HINT_AFTER = 9; // 이만큼(초) 못 치면 휘두르는 방법 다시 안내

// 구멍마다 다른 모습: 깃발 쪽(1 = 오른쪽 위, -1 = 왼쪽 위), 높이(놀이 영역 비율), 꾸밈
const HOLES = [
  { side: 1, hy: 0.3, deco: 'flowers', say: '첫 번째 구멍이에요!' },
  { side: -1, hy: 0.26, deco: 'pond', say: '이번엔 연못 옆을 지나가요!' },
  { side: 1, hy: 0.34, deco: 'sand', say: '이번엔 모래밭을 지나가요!' },
  { side: -1, hy: 0.3, deco: 'hill', say: '이번엔 언덕을 넘어가요!' },
  { side: 1, hy: 0.24, deco: 'rainbow', say: '마지막 구멍! 무지개 다리를 지나가요!' },
];
const SHORT_LINES = ['좋아요! 한 번 더 휙!', '데굴데굴~ 조금만 더!', '잘했어요! 다시 쳐 볼까요?'];
const TURN_NAMES = ['파란 친구', '분홍 친구'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;

// 2차 베지어 곡선 위의 점
function bez(a, c, b, k) {
  const u = 1 - k;
  return { x: u * u * a.x + 2 * u * k * c.x + k * k * b.x, y: u * u * a.y + 2 * u * k * c.y + k * k * b.y };
}

// 한 사람의 손 위치 정보: 두 손 가운데(mid), 두 손이 모였는지(together), 각 손목
function handsOf(pose) {
  const sh = shoulders(pose);
  if (!sh) return null;
  const l = visible(pose[P.lWrist], 0.35) ? pose[P.lWrist] : null;
  const r = visible(pose[P.rWrist], 0.35) ? pose[P.rWrist] : null;
  if (!l && !r) return { sh, l, r, mid: null, together: false };
  if (l && r) {
    const d = Math.hypot(l.x - r.x, l.y - r.y);
    return { sh, l, r, mid: { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }, together: d < sh.sw * HANDS_TOGETHER, apart: d / sh.sw };
  }
  return { sh, l, r, mid: l ?? r, together: false, apart: Infinity };
}

// 최근 기록(hist: [{t, x, y}])에서 지금 속도(sw/초)와 최근 이동 거리(sw)
function motionOf(hist, t, sw) {
  const now = hist[hist.length - 1];
  let back = null;
  for (let i = hist.length - 2; i >= 0; i--) {
    if (t - hist[i].t >= SPEED_WINDOW) {
      back = hist[i];
      break;
    }
  }
  if (!back) return { speed: 0, travel: 0 };
  const speed = Math.hypot(now.x - back.x, now.y - back.y) / (now.t - back.t) / sw;
  let travel = 0;
  let maxStep = 0;
  for (let i = 1; i < hist.length; i++) {
    if (t - hist[i - 1].t > 0.35) continue;
    const d = Math.hypot(hist[i].x - hist[i - 1].x, hist[i].y - hist[i - 1].y);
    travel += d;
    maxStep = Math.max(maxStep, d);
  }
  // 인식이 한 번에 '툭' 튄 것(한 걸음이 대부분)은 스윙이 아니다.
  if (maxStep > travel * MAX_STEP_SHARE) return { speed: 0, travel: 0 };
  return { speed, travel: travel / sw };
}

// 골프 공 치기: 두 손을 모아 막대를 잡고 휙! 휘두르면 공이 구멍 쪽으로 굴러간다.
// 세게 치면 한 번에 쏙, 약하면 가다가 멈추고 다음에 거기서 이어서 친다. 세 번 쳐도 안 들어가면 마법처럼 쏙.
// 두 명이면 한 번씩 번갈아 치고, 공 앞 표시(티 매트)가 차례인 아이 앞으로 간다.
export class GolfScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
    this.states = new Map();
    this.order = []; // 화면에 보이는 아이 id(아바타 색 순서)
    // 보호자 리포트용 기록(메모리에만). bestPower = 가장 센 스윙의 힘(1이면 한 번에 쏙)
    this.stats = { holes: 0, strokes: 0, holeInOne: 0, bestPower: 0 };
  }

  // 아바타 색: 먼저 들어온 아이 파랑, 두 번째 아이 분홍(차례 표시와 같은 색)
  avatarColorOf(person) {
    const i = this.order.indexOf(person.id);
    return PLAYER_COLORS[i < 0 ? 0 : i % 2];
  }

  get ballR() {
    return this.game.unit * 0.028;
  }

  onResize() {
    const z = this.game.zone;
    if (!this.tee) return;
    this.tee.x = clamp(this.tee.x, z.x, z.x + z.w);
    this.tee.y = clamp(this.tee.y, z.y, z.y + z.h);
  }

  enter() {
    const z = this.game.zone;
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.states = new Map();
    this.order = [];
    this.turn = 0; // 차례인 아이(order 의 번호)
    this.tee = { x: z.x + z.w * 0.5, y: z.y + z.h * 0.86 };
    this.lastVoice = -Infinity;
    this.startHole(0, false);
    this.state = 'intro';
    this.after(speak('골프 놀이! 두 손으로 막대를 꼭 잡고, 공을 휙! 쳐서 구멍에 쏙 넣어요.'), () => this.aim());
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

  say(text, then) {
    this.lastVoice = this.game.time;
    if (then) this.after(speak(text), then);
    else speak(text);
  }

  // 새 구멍 준비. 깃발이 아이 바로 옆이면 반대쪽으로 옮긴다.
  startHole(index, announce = true) {
    const z = this.game.zone;
    this.holeIndex = index;
    const hole = HOLES[index];
    let side = hole.side;
    const hx = (sd) => z.x + z.w * (sd > 0 ? 0.86 : 0.14);
    if (Math.abs(this.tee.x - hx(side)) < z.w * 0.28) side = -side;
    this.hole = { ...hole, side };
    this.p = 0; // 공이 코스를 지나온 비율(0 = 티, 1 = 구멍)
    this.strokes = 0;
    this.ballAnim = null;
    this.sinkT = 0;
    if (announce) {
      this.state = 'intro';
      sfx.whistle();
      this.say(hole.say, () => this.aim());
    }
  }

  get holePos() {
    const z = this.game.zone;
    return { x: z.x + z.w * (this.hole.side > 0 ? 0.86 : 0.14), y: z.y + z.h * this.hole.hy };
  }

  // 코스 곡선: 티에서 옆으로 굴러가다가 깃발 쪽으로 올라간다(아이 몸 앞을 가리지 않게).
  course() {
    const a = this.tee;
    const b = this.holePos;
    const c = { x: lerp(a.x, b.x, 0.8), y: lerp(a.y, b.y, 0.25) };
    return { a, b, c };
  }

  ballPos() {
    const { a, b, c } = this.course();
    const anim = this.ballAnim;
    const p = anim ? anim.p : this.p;
    const pt = bez(a, c, b, Math.min(1, p));
    let lift = anim?.lift ?? 0;
    // 언덕 구멍: 가운데쯤에서 공이 언덕을 넘으며 살짝 떠 보인다.
    if (this.hole.deco === 'hill') lift += Math.max(0, Math.sin(((p - 0.35) / 0.3) * Math.PI)) * (p > 0.35 && p < 0.65 ? 1 : 0) * this.game.unit * 0.04;
    return { x: pt.x, y: pt.y, lift };
  }

  aim() {
    this.state = 'aim';
    this.aimT = 0;
    this.apartT = 0;
    for (const s of this.states.values()) s.hist = [];
  }

  // 보호자·PC 테스트용: 누르면 보통 세기로 친다(두 번이면 쏙).
  onTap() {
    if (this.state === 'aim') this.hit(0.75, null);
  }

  update(dt, input) {
    const t = this.game.time;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    const people = perPerson(this.states, input.people);
    // 아바타 색 순서: 먼저 들어온 아이부터(사라진 아이는 빠진다)
    this.order = this.order.filter((id) => people.some((p) => p.id === id));
    for (const p of people) if (!this.order.includes(p.id)) this.order.push(p.id);
    if (this.turn >= this.order.length) this.turn = 0;
    const turnId = this.order[this.turn];

    // 티(공 앞 표시)는 차례인 아이 앞 발밑으로 천천히 따라간다.
    const turnPerson = people.find((p) => p.id === turnId && !p.lost) ?? people.find((p) => !p.lost);
    const target = this.teeTarget(turnPerson?.pose);
    const follow = Math.min(1, dt * (this.state === 'aim' ? 3 : 1.5));
    this.tee.x += (target.x - this.tee.x) * follow;
    this.tee.y += (target.y - this.tee.y) * follow;

    // 아이마다 손 움직임 기록 + 스윙 판정
    let swing = null;
    let turnApart = false;
    for (const person of people) {
      const s = person.state;
      s.hist ??= [];
      const info = person.lost ? null : handsOf(person.pose);
      s.info = info;
      if (!info?.mid) {
        s.hist = [];
        s.arm = null;
        continue;
      }
      if (person.id === turnId && info.l && info.r && !info.together) turnApart = true;
      // 몸(어깨) 기준 위치로 기록: 점프하거나 옆으로 걸어도 스윙으로 치지 않게
      s.hist.push({ t, x: info.mid.x - info.sh.mx, y: info.mid.y - info.sh.my, together: info.together });
      while (s.hist.length && t - s.hist[0].t > 0.6) s.hist.shift();
      if (this.state !== 'aim') {
        s.arm = null;
        continue;
      }
      const mayCount = person.id === turnId || this.aimT > OTHER_KID_AFTER || !turnPerson;
      const v = this.swingSpeed(s, info, t);
      if (v > 0 && mayCount) {
        // 스윙 시작: 잠깐 동안 가장 빠른 속도를 모은다.
        if (!s.arm) s.arm = { t, peak: v };
        else s.arm.peak = Math.max(s.arm.peak, v);
      }
      if (s.arm && (t - s.arm.t >= PEAK_WAIT || v === 0)) {
        if (!swing || s.arm.peak > swing.peak) swing = { peak: s.arm.peak, id: person.id };
        s.arm = null;
      }
    }

    if (this.state === 'aim') {
      this.aimT += dt;
      this.apartT = turnApart ? this.apartT + dt : 0;
      if (swing) {
        this.hit(Math.min(MAX_POWER, swing.peak / STRONG_SPEED), swing.id);
      } else if (this.apartT > APART_HINT_AFTER && t - this.lastVoice > HINT_GAP) {
        this.say('두 손을 모아서 막대를 잡아요!');
      } else if (this.aimT > IDLE_HINT_AFTER && t - this.lastVoice > HINT_GAP + 2) {
        this.say('막대를 휙! 휘둘러서 공을 쳐요!');
      }
    }

    this.updateBall(dt);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.pulse.fill(0);
        this.startHole(0);
      }
    }
  }

  // 지금 프레임이 스윙이면 속도(sw/초), 아니면 0
  swingSpeed(s, info, t) {
    const { sh } = info;
    const sw = sh.sw;
    const low = (p) => p.y > sh.my + sw * LOW && Math.abs(p.x - sh.mx) < sw * SIDE;
    // 1) 두 손을 모은 스윙
    const recentTogether = s.hist.filter((h) => t - h.t <= 0.25);
    const togetherShare = recentTogether.filter((h) => h.together).length / Math.max(1, recentTogether.length);
    if (togetherShare >= 0.5 && low(info.mid)) {
      const m = motionOf(s.hist, t, sw);
      if (m.speed >= SWING_SPEED && m.travel >= TRAVEL) return m.speed;
    }
    // 2) 너그러운 대안: 오래 못 친 아이는 한 손으로 세게 휘둘러도 인정
    if (this.aimT > ONE_HAND_AFTER) {
      s.lh ??= { l: [], r: [] };
      let best = 0;
      for (const side of ['l', 'r']) {
        const p = info[side];
        const h = s.lh[side];
        if (!p) {
          h.length = 0;
          continue;
        }
        h.push({ t, x: p.x - sh.mx, y: p.y - sh.my });
        while (h.length && t - h[0].t > 0.6) h.shift();
        if (!low(p)) continue;
        const m = motionOf(h, t, sw);
        if (m.speed >= SWING_SPEED * ONE_HAND_SPEED && m.travel >= TRAVEL) best = Math.max(best, m.speed / ONE_HAND_SPEED);
      }
      return best;
    }
    return 0;
  }

  // 공을 놓을 자리: 아이 앞 엉덩이 아래(안 보이면 놀이 영역 아래쪽), 집 버튼은 피한다.
  teeTarget(pose) {
    const { zone: z, homeButton: hb } = this.game;
    const r = this.ballR;
    let x = z.x + z.w * 0.5;
    let y = z.y + z.h * 0.86;
    const sh = pose && shoulders(pose);
    if (sh) {
      x = sh.mx;
      const hips = [pose[P.lHip], pose[P.rHip]].filter((p) => visible(p));
      const hipY = hips.length ? hips.reduce((a, p) => a + p.y, 0) / hips.length : sh.my + sh.sw * 1.6;
      y = hipY + sh.sw * 0.7;
    }
    y = clamp(y, z.y + z.h * 0.55, z.y + z.h - r * 2.5);
    x = clamp(x, z.x + r * 3, z.x + z.w - r * 3);
    // 집 버튼(왼쪽 아래)과 겹치지 않게 오른쪽으로 비킨다.
    if (hb && y > hb.y - hb.r * 2.2) x = Math.max(x, hb.x + hb.r * 2.4 + r);
    return { x, y };
  }

  // 공 치기. power = 1 이면 처음 자리에서 구멍까지 한 번에 굴러가는 세기
  hit(power, id) {
    const { particles, unit } = this.game;
    this.stats.strokes++;
    this.stats.bestPower = Math.max(this.stats.bestPower, Math.round(power * 100) / 100);
    this.strokes++;
    const left = 1 - this.p;
    const into = power >= left - 0.03;
    const p1 = into ? 1 : this.p + power;
    this.ballAnim = {
      p: this.p,
      p0: this.p,
      p1,
      k: 0,
      dur: 0.6 + (p1 - this.p) * 1.1,
      lift: 0,
      liftH: unit * (0.02 + Math.min(power, 1.2) * 0.07),
      into,
      bonk: into && power >= left * FLAG_BONK_POWER,
      magic: false,
    };
    this.state = 'roll';
    sfx.bonk();
    sfx.whoosh();
    const b = this.ballPos();
    particles.ring(b.x, b.y, { color: '#fff', size: this.ballR * 3 });
    particles.burst(b.x, b.y, { count: 14, colors: [COLORS.yellow, '#fff', COLORS.green], speed: unit * 0.4, size: unit * 0.014, shape: 'star', gravity: 220 });
    // 두 명이면 친 다음 차례가 바뀐다.
    if (this.order.length > 1 && id !== null) this.turn = (this.order.indexOf(id) + 1) % this.order.length;
  }

  magicRoll() {
    this.ballAnim = { p: this.p, p0: this.p, p1: 1, k: 0, dur: 2.2, lift: 0, liftH: 0, into: true, bonk: false, magic: true };
    this.state = 'roll';
    sfx.sparkle();
    this.say('데굴데굴… 쏙!');
  }

  updateBall(dt) {
    const { particles, unit } = this.game;
    const a = this.ballAnim;
    if (this.state === 'roll' && a) {
      a.k = Math.min(1, a.k + dt / a.dur);
      a.p = lerp(a.p0, a.p1, a.magic ? a.k : easeOut(a.k));
      // 처음 반은 통통 튀며 날아간다(셀수록 높이).
      a.lift = a.k < 0.5 ? Math.abs(Math.sin(a.k * 2 * Math.PI)) * a.liftH * (1 - a.k) : 0;
      if (a.magic && Math.random() < dt * 25) {
        const b = this.ballPos();
        particles.burst(b.x, b.y, { count: 2, colors: [COLORS.yellow, '#fff', COLORS.pink], speed: unit * 0.1, size: unit * 0.01, shape: 'star', gravity: 40, life: 0.6 });
      }
      if (a.k >= 1) {
        if (!a.into) this.stopShort();
        else if (a.bonk) {
          // 너무 세게 쳤다: 깃대에 통! 맞고 살짝 튀었다가 쏙
          this.state = 'bonk';
          this.stateT = 0.5;
          sfx.boing();
          const h = this.holePos;
          particles.burst(h.x, h.y - unit * 0.08, { count: 8, colors: ['#fff', COLORS.yellow], speed: unit * 0.25, size: unit * 0.012, shape: 'star', gravity: 200 });
        } else this.sink();
      }
    } else if (this.state === 'bonk') {
      this.stateT -= dt;
      const k = 1 - this.stateT / 0.5;
      a.p = 1 - Math.sin(k * Math.PI) * 0.06;
      a.lift = Math.sin(k * Math.PI) * unit * 0.05;
      if (this.stateT <= 0) {
        a.p = 1;
        a.lift = 0;
        this.sink();
      }
    } else if (this.state === 'sink') {
      this.sinkT += dt;
    }
  }

  stopShort() {
    this.p = this.ballAnim.p1;
    this.ballAnim = null;
    if (this.strokes >= MAGIC_AFTER) {
      this.state = 'wait';
      this.after(new Promise((r) => setTimeout(r, 600)), () => this.magicRoll());
      return;
    }
    this.state = 'wait';
    sfx.peek();
    let line = pick(SHORT_LINES);
    if (this.order.length > 1) line += ` 이번엔 ${TURN_NAMES[this.turn % 2]} 차례!`;
    this.say(line, () => this.aim());
  }

  sink() {
    const { particles, unit } = this.game;
    const a = this.ballAnim;
    this.state = 'sink';
    this.sinkT = 0;
    this.p = 1;
    this.stats.holes++;
    if (this.strokes === 1) this.stats.holeInOne++;
    sfx.pop();
    sfx.success();
    const h = this.holePos;
    particles.burst(h.x, h.y, { count: 36, colors: [COLORS.yellow, '#fff', COLORS.pink, COLORS.green], speed: unit * 0.6, size: unit * 0.02, shape: 'star', gravity: 200 });
    this.pulse[this.score] = 1;
    this.score++;
    const next = () => {
      if (this.score >= GOAL) {
        this.state = 'celebrate';
        this.stateT = 4.5;
        this.fireT = 0;
        sfx.fanfare();
        this.say('다섯 개 구멍에 모두 쏙! 골프 왕이에요!');
        return;
      }
      this.startHole(this.holeIndex + 1);
    };
    if (a?.magic) this.after(new Promise((r) => setTimeout(r, 900)), next);
    else this.say(this.strokes === 1 ? '쏙! 한 번에 들어갔어요!' : '쏙! 들어갔어요!', next);
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    const { zone: z, unit, time } = this.game;
    this.drawGround(ctx, z, unit);
    const { a, b, c } = this.course();
    this.drawFairway(ctx, a, b, c, unit);
    this.drawDeco(ctx, a, b, c, unit, time);
    this.drawHole(ctx, b, unit, time);
    this.drawTee(ctx, a, unit, time);
    this.drawBall(ctx, unit, time);
    for (const id of this.order) {
      const s = this.states.get(id);
      if (s?.info) this.drawClub(ctx, s.info, id === this.order[this.turn], time);
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  // 놀이 영역 아래쪽을 덮는 잔디(카메라 화면이 비치도록 반투명)
  drawGround(ctx, z, unit) {
    const top = z.y + z.h * (this.hole.hy - 0.12);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    const g = ctx.createLinearGradient(0, top, 0, z.y + z.h);
    g.addColorStop(0, 'rgba(155,216,138,0)');
    g.addColorStop(0.25, 'rgba(155,216,138,0.35)');
    g.addColorStop(1, 'rgba(120,200,110,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(z.x, top, z.w, z.y + z.h - top);
    ctx.restore();
  }

  // 공이 굴러갈 길(밝은 잔디 띠)
  drawFairway(ctx, a, b, c, unit) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    };
    path();
    ctx.strokeStyle = 'rgba(76,170,90,0.85)';
    ctx.lineWidth = unit * 0.13;
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(142,222,120,0.95)';
    ctx.lineWidth = unit * 0.11;
    ctx.stroke();
    // 잔디 줄무늬(점선)
    path();
    ctx.setLineDash([unit * 0.03, unit * 0.04]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = unit * 0.008;
    ctx.stroke();
    ctx.setLineDash([]);
    // 구멍 둘레 둥근 그린
    ctx.fillStyle = 'rgba(76,170,90,0.9)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, unit * 0.13, unit * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#A6E58F';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, unit * 0.12, unit * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 구멍마다 다른 꾸밈(연못·모래·언덕·무지개·꽃)
  drawDeco(ctx, a, b, c, unit, time) {
    const mid = bez(a, c, b, 0.5);
    const after = bez(a, c, b, 0.55);
    const nx = -(after.y - mid.y);
    const ny = after.x - mid.x;
    const nl = Math.hypot(nx, ny) || 1;
    // 길 바깥쪽(아래쪽 또는 옆) 방향 수직 벡터
    let ox = (nx / nl) * unit * 0.15;
    let oy = (ny / nl) * unit * 0.15;
    if (oy < 0) {
      ox = -ox;
      oy = -oy;
    }
    const deco = this.hole.deco;
    ctx.save();
    if (deco === 'pond') {
      const x = mid.x + ox;
      const y = mid.y + oy * 0.8;
      ctx.fillStyle = 'rgba(102,190,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(x, y, unit * 0.11, unit * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = unit * 0.004;
      ctx.lineCap = 'round';
      for (const dx of [-0.05, 0.04]) {
        ctx.beginPath();
        ctx.arc(x + unit * dx, y + unit * 0.012, unit * 0.018, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      duck(ctx, x + Math.sin(time * 0.8) * unit * 0.04, y - unit * 0.015, unit * 0.022, time);
    } else if (deco === 'sand') {
      const x = mid.x + ox * 0.9;
      const y = mid.y + oy * 0.9;
      ctx.fillStyle = '#F3D9A4';
      ctx.beginPath();
      ctx.ellipse(x, y, unit * 0.09, unit * 0.045, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#D9B877';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(i * 2.3) * unit * 0.055, y + Math.sin(i * 1.7) * unit * 0.022, unit * 0.004, 0, Math.PI * 2);
        ctx.fill();
      }
      // 모래 위 작은 삽
      ctx.strokeStyle = '#8B5E3C';
      ctx.lineWidth = unit * 0.005;
      ctx.beginPath();
      ctx.moveTo(x + unit * 0.05, y - unit * 0.005);
      ctx.lineTo(x + unit * 0.075, y - unit * 0.04);
      ctx.stroke();
      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.ellipse(x + unit * 0.047, y, unit * 0.012, unit * 0.008, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === 'hill') {
      // 길 가운데 언덕(볼록한 잔디)
      const g = ctx.createRadialGradient(mid.x - unit * 0.02, mid.y - unit * 0.03, unit * 0.01, mid.x, mid.y, unit * 0.1);
      g.addColorStop(0, '#C8F0A8');
      g.addColorStop(1, 'rgba(76,170,90,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, unit * 0.1, unit * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const k of [-1, 1]) this.flower(ctx, mid.x + k * unit * 0.13, mid.y + unit * 0.03, unit * 0.014, k > 0 ? COLORS.yellow : COLORS.pink);
    } else if (deco === 'rainbow') {
      const r = unit * 0.09;
      ctx.lineWidth = unit * 0.009;
      RAINBOW.forEach((col, i) => {
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.arc(mid.x, mid.y + unit * 0.03, r - i * unit * 0.009, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      });
    }
    // 어느 구멍이든 꽃 몇 송이
    const flowers = deco === 'flowers' ? 5 : 2;
    for (let i = 0; i < flowers; i++) {
      const k = 0.2 + (i / Math.max(1, flowers - 1)) * 0.6;
      const p = bez(a, c, b, k);
      const sgn = i % 2 ? 1 : -1;
      this.flower(ctx, p.x + sgn * ox * 0.75, p.y + sgn * oy * 0.75, unit * 0.013, RAINBOW[(i * 2 + this.holeIndex) % RAINBOW.length]);
    }
    ctx.restore();
  }

  flower(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // 구멍과 펄럭이는 깃발
  drawHole(ctx, b, unit, time) {
    drawFlagHole(ctx, b.x, b.y, unit, time, this.state === 'bonk' ? Math.sin(time * 40) * 0.08 : 0, this.hole.side);
    // 공이 들어가면 깃발 위로 별이 반짝
    if (this.state === 'sink' || this.state === 'celebrate') {
      const k = Math.min(1, this.sinkT * 3);
      star(ctx, b.x, b.y - unit * 0.2, unit * 0.03 * k * (1 + Math.sin(time * 8) * 0.15), COLORS.yellow, '#fff');
    }
  }

  // 티 매트: 차례인 아이 색 테두리. 공이 굴러가 있으면 공까지 반짝이는 점선으로 이어 준다.
  drawTee(ctx, a, unit, time) {
    const color = PLAYER_COLORS[this.order.length ? this.turn % 2 : 0];
    const r = this.ballR;
    ctx.save();
    const glow = this.state === 'aim' ? 1 + Math.sin(time * 5) * 0.08 : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + r * 0.6, r * 3.6 * glow, r * 1.5 * glow, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * 0.008;
    ctx.stroke();
    // 나무 티
    ctx.fillStyle = '#E9C893';
    ctx.beginPath();
    ctx.moveTo(a.x - r * 0.45, a.y + r * 0.85);
    ctx.lineTo(a.x + r * 0.45, a.y + r * 0.85);
    ctx.lineTo(a.x, a.y + r * 1.5);
    ctx.fill();
    if (this.p > 0 && this.state !== 'sink' && this.state !== 'celebrate') {
      // 공이 멈춘 곳까지: 여기서 휘두르면 저 공이 굴러가요
      const bp = this.ballPos();
      ctx.setLineDash([unit * 0.01, unit * 0.018]);
      ctx.lineDashOffset = -time * unit * 0.05;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = unit * 0.006;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bp.x, bp.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBall(ctx, unit, time) {
    let k = 1;
    if (this.state === 'sink' || this.state === 'celebrate') k = Math.max(0, 1 - this.sinkT * 3);
    if (k <= 0) return;
    const b = this.ballPos();
    const r = this.ballR;
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + r * 0.8, r * 0.9 * k, r * 0.35 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    const y = b.y - b.lift;
    const bounce = this.state === 'aim' ? Math.abs(Math.sin(time * 3)) * r * 0.15 : 0;
    drawBall(ctx, b.x, y - bounce, r * k, (this.ballAnim?.p ?? this.p) * 30);
  }

  // 모은 두 손에서 땅 쪽으로 내려온 막대. 손이 떨어져 있으면 흐리게.
  drawClub(ctx, info, isTurn, time) {
    if (!info.mid) return;
    const { sh, mid, together } = info;
    const sw = sh.sw;
    const grip = together ? mid : info.l && info.r ? (info.l.y > info.r.y ? info.l : info.r) : mid;
    // 손이 몸 가운데에서 벗어난 만큼 막대가 바깥으로 기운다(시계추처럼).
    const dx = grip.x - sh.mx;
    const dy = Math.max(sw * 0.3, grip.y - sh.my);
    const ang = clamp(Math.atan2(dx, dy), -1.4, 1.4);
    // 막대 끝(머리)이 대략 공 높이(땅)에 닿게
    const len = clamp((this.tee.y + this.ballR - grip.y) / Math.max(0.5, Math.cos(ang)), sw * 0.7, sw * 1.5);
    const hx = grip.x + Math.sin(ang) * len;
    const hy = grip.y + Math.cos(ang) * len;
    ctx.save();
    ctx.globalAlpha = together ? (isTurn ? 1 : 0.75) : 0.35 + Math.sin(time * 4) * 0.05;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#B7BCC8';
    ctx.lineWidth = sw * 0.09;
    ctx.beginPath();
    ctx.moveTo(grip.x, grip.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    // 손잡이(빨간 고무)
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = sw * 0.14;
    ctx.beginPath();
    ctx.moveTo(grip.x - Math.sin(ang) * sw * 0.05, grip.y - Math.cos(ang) * sw * 0.05);
    ctx.lineTo(grip.x + Math.sin(ang) * sw * 0.25, grip.y + Math.cos(ang) * sw * 0.25);
    ctx.stroke();
    // 머리(동글동글한 노란 헤드)
    ctx.translate(hx, hy);
    ctx.rotate(-ang);
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.roundRect(-sw * 0.28, -sw * 0.08, sw * 0.42, sw * 0.2, sw * 0.09);
    ctx.fill();
    ctx.fillStyle = '#F4A100';
    ctx.beginPath();
    ctx.roundRect(-sw * 0.28, sw * 0.04, sw * 0.42, sw * 0.08, sw * 0.04);
    ctx.fill();
    ctx.restore();
  }
}

// ---- 공용 그림 ----

// 하얀 골프공(옴폭옴폭 점). rot = 굴러간 정도(점이 돌아간다)
function drawBall(ctx, x, y, r, rot = 0) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(61,44,46,0.35)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(61,44,46,0.18)';
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 구멍 + 깃대 + 펄럭이는 빨간 깃발. u = 크기 단위, wob = 깃대 흔들림(라디안), dir = 깃발 방향
function drawFlagHole(ctx, x, y, u, t, wob = 0, dir = 1) {
  ctx.save();
  ctx.fillStyle = '#2E5A2A';
  ctx.beginPath();
  ctx.ellipse(x, y, u * 0.04, u * 0.018, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(wob);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = u * 0.007;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -u * 0.17);
  ctx.stroke();
  const f = -dir;
  const wave = Math.sin(t * 5) * 0.12;
  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.moveTo(0, -u * 0.17);
  ctx.quadraticCurveTo(f * u * 0.045, -u * (0.165 + wave * 0.1), f * u * 0.09 * (1 + wave * 0.3), -u * 0.145);
  ctx.quadraticCurveTo(f * u * 0.045, -u * (0.125 - wave * 0.1), 0, -u * 0.12);
  ctx.fill();
  ctx.restore();
}

// ---- 놀이 설명(두 손으로 막대를 잡고 휙! → 공이 데굴데굴 → 구멍에 쏙) ----
const loop = (t, period) => (t % period) / period;

// 시범용 친구: 두 손을 모아 막대를 잡은 자세. phi = 막대 각도(0 = 똑바로 아래, 음수 = 왼쪽으로 들어 올림)
function golfKid(ctx, x, y, s, phi) {
  const R = 0.95;
  const px = 0;
  const py = -0.45;
  const hx = px + Math.sin(phi) * R;
  const hy = py + Math.cos(phi) * R;
  kid(ctx, x, y, s, { hands: [[hx - 0.06, hy], [hx + 0.06, hy]], elbows: [[-0.3 + hx * 0.4, 0.05 + hy * 0.3], [0.3 + hx * 0.4, 0.05 + hy * 0.3]], color: COLORS.blue });
  // 막대
  const gx = x + hx * s;
  const gy = y + hy * s;
  const ex = gx + Math.sin(phi) * s * 0.95;
  const ey = gy + Math.cos(phi) * s * 0.95;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#B7BCC8';
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = s * 0.16;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + Math.sin(phi) * s * 0.3, gy + Math.cos(phi) * s * 0.3);
  ctx.stroke();
  ctx.translate(ex, ey);
  ctx.rotate(-phi);
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.roundRect(-s * 0.32, -s * 0.1, s * 0.48, s * 0.24, s * 0.1);
  ctx.fill();
  ctx.restore();
}

export const guide = {
  text: '두 손을 모아 막대를 잡고, 휙! 휘둘러서 공을 구멍에 쏙 넣어요.',
  demo: (ctx, s, t) => {
    const p = loop(t, 4.5);
    const T = p * 4.5;
    // 잔디와 코스
    ctx.fillStyle = 'rgba(155,216,138,0.6)';
    ctx.fillRect(-s * 8, s * 1.5, s * 16, s * 4);
    const a = { x: -s * 3.4, y: s * 2.45 };
    const b = { x: s * 4.8, y: -s * 0.2 };
    const c = { x: s * 3.2, y: s * 2.3 };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8EDE78';
    ctx.lineWidth = s * 1.0;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#A6E58F';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, s * 1.1, s * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFlagHole(ctx, b.x, b.y, s * 11, t, 0, 1);
    // 스윙: 천천히 들어 올렸다가(0~1초) 휙!(1~1.3초) 끝까지 돌렸다가 돌아온다.
    let phi;
    if (T < 1) phi = -1.3 * (T / 1);
    else if (T < 1.3) phi = lerp(-1.3, 1.4, (T - 1) / 0.3);
    else if (T < 2.3) phi = 1.4;
    else if (T < 2.9) phi = lerp(1.4, 0, (T - 2.3) / 0.6);
    else phi = 0;
    const hitT = 1.15;
    // 공: 맞기 전엔 티 위, 맞으면 곡선을 따라 굴러가 구멍에 쏙
    let ball = null;
    if (T < hitT) ball = { ...a, k: 1 };
    else if (T < 3.0) {
      const k = easeOut((T - hitT) / (3.0 - hitT));
      const pt = bez(a, c, b, k);
      ball = { x: pt.x, y: pt.y - (k < 0.4 ? Math.abs(Math.sin(k * 2.5 * Math.PI)) * s * 0.6 * (1 - k) : 0), k: 1 };
    } else if (T < 3.3) ball = { ...b, k: 1 - (T - 3.0) / 0.3 };
    // 다시 처음 자리에 공이 놓인다
    if (T > 4.1) ball = { ...a, k: (T - 4.1) / 0.4 };
    golfKid(ctx, -s * 3.4, -s * 0.4, s * 1.4, phi);
    if (ball && ball.k > 0) drawBall(ctx, ball.x, ball.y - s * 0.3, s * 0.3 * ball.k, T * 3);
    if (T > hitT && T < hitT + 0.35) {
      const k = (T - hitT) / 0.35;
      for (let i = 0; i < 5; i++) {
        const an = (i / 5) * Math.PI * 2;
        star(ctx, a.x + Math.cos(an) * s * (0.4 + k), a.y - s * 0.3 + Math.sin(an) * s * (0.4 + k), s * 0.18 * (1 - k * 0.5), i % 2 ? '#fff' : COLORS.yellow);
      }
    }
    if (T > 3.0 && T < 4.1) {
      const k = (T - 3.0) / 1.1;
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2 + k;
        star(ctx, b.x + Math.cos(an) * s * (0.5 + k * 1.3), b.y - s * 0.6 + Math.sin(an) * s * (0.5 + k * 1.3), s * 0.25, i % 2 ? COLORS.pink : COLORS.yellow, '#fff');
      }
    }
  },
};

// 메뉴 아이콘: 잔디 위 깃발과 구멍, 막대가 공을 톡
export function menuIcon(ctx, r, t) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#9BD88A';
  ctx.fillRect(-r, r * 0.15, r * 2, r);
  ctx.fillStyle = '#B9E8A6';
  ctx.beginPath();
  ctx.ellipse(r * 0.3, r * 0.2, r * 0.5, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawFlagHole(ctx, r * 0.35, r * 0.2, r * 3.6, t, 0, 1);
  // 막대가 시계추처럼 흔들리며 공을 톡
  const sw = Math.sin(t * 3) * 0.35 - 0.1;
  ctx.save();
  ctx.translate(-r * 0.45, -r * 0.55);
  ctx.rotate(-sw);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#B7BCC8';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, r * 0.95);
  ctx.stroke();
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = r * 0.11;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, r * 0.25);
  ctx.stroke();
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.roundRect(-r * 0.2, r * 0.88, r * 0.28, r * 0.14, r * 0.06);
  ctx.fill();
  ctx.restore();
  drawBall(ctx, -r * 0.2, r * 0.48, r * 0.12, 0);
}
