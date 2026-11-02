import { progressRing, star, COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { bear, chick, duck, penguin, rabbit } from '../engine/animals.js';
import { kid, POSE_SHAPES } from '../engine/scenery.js';
import { armPoint, kneeUp, perPerson, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 5; // 다리를 이만큼 건너면 크게 축하
const CROSS_TIME = 5; // 한 번 건너는 데 필요한 균형 시간(초, 쉬는 시간은 빼고 합한 값)
const GRACE = 0.3; // 인식이 잠깐 흔들려도 이 시간(초) 동안은 계속 균형 잡는 중으로 본다
// 한 발 들기 판정(어깨너비 배). 다리가 보일 때만 쓴다.
const KNEE_DIFF = 0.35; // 두 무릎 높이 차이가 이 이상이면 한 발을 든 것
const ANKLE_DIFF = 0.5; // 발을 뒤로 접어 올린 경우: 두 발목 높이 차이
// 다리가 화면에 안 보일 때(태블릿에서 흔함)는 '비행기 팔'(두 팔을 옆으로 쭉)로 대신 판정한다.
const ARM_LEVEL = 0.6; // 손이 어깨 높이에서 이만큼 안쪽이면 '옆으로 편 팔'
const ARM_SPAN = 2.0; // 두 손 사이가 이 이상 벌어져야 한다
const STOP_VOICE_AFTER = 2.5; // 균형이 이만큼(초) 끊기면 다시 안내
const VOICE_GAP = 7; // 다시 안내하는 음성 최소 간격(초)
const CHEER_GAP = 6; // "그대로!" 응원 최소 간격(초)
const STEP_EVERY = 0.45; // 친구가 한 걸음 걸을 때마다 반짝(균형 시간 기준, 초)
const FRIENDS = [rabbit, chick, bear, duck, penguin];
const CHEERS = ['좋아요, 그대로!', '흔들흔들, 잘하고 있어요!', '멋져요, 계속!'];

// 한 사람의 균형 상태. side: 'l'/'r' = 든 다리(아이 기준 왼/오른), 'arms' = 비행기 팔(다리가 안 보일 때), null = 아님
function balanceOf(pose) {
  const sh = shoulders(pose);
  if (!sh) return null;
  const lk = pose[P.lKnee];
  const rk = pose[P.rKnee];
  if (visible(lk) && visible(rk)) {
    const l = kneeUp(pose, 'l');
    const r = kneeUp(pose, 'r');
    if (l && !r) return 'l';
    if (r && !l) return 'r';
    if (l && r) return null; // 둘 다 높으면 쪼그려 앉았거나 너무 가까이 온 것
    const dk = lk.y - rk.y; // 양수면 왼무릎이 아래 → 오른다리를 든 것
    if (Math.abs(dk) > sh.sw * KNEE_DIFF) return dk > 0 ? 'r' : 'l';
    const la = pose[P.lAnkle];
    const ra = pose[P.rAnkle];
    if (visible(la) && visible(ra)) {
      const da = la.y - ra.y;
      if (Math.abs(da) > sh.sw * ANKLE_DIFF) return da > 0 ? 'r' : 'l';
    }
    return null;
  }
  const l = armPoint(pose, 'l');
  const r = armPoint(pose, 'r');
  if (!l || !r) return null;
  const level = (p) => Math.abs(p.y - sh.my) < sh.sw * ARM_LEVEL;
  return level(l) && level(r) && Math.abs(l.x - r.x) > sh.sw * ARM_SPAN ? 'arms' : null;
}

// 외나무다리 균형: 아이가 한 발로 서(다리가 안 보이면 비행기 팔) 있는 동안만 동물 친구가 다리를 건넌다.
// 균형을 놓치면 친구가 멈춰서 흔들흔들(벌점 없음). 두 명이면 누구든 균형을 잡으면 앞으로 간다.
export class BalanceScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.green;

  constructor(game) {
    this.game = game;
    this.states = new Map();
    // 보호자 리포트용 기록(메모리에만). standLeft = 왼발로 서서(오른다리를 들고) 가장 오래 버틴 시간(초)
    this.stats = { standLeft: 0, standRight: 0, airplane: 0, crossings: 0, balanceTime: 0 };
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.logY = z.y + z.h * 0.72;
    this.bankW = z.w * 0.17;
    this.x0 = z.x + Math.max(z.w * 0.13, unit * 0.2); // 출발점이 왼쪽 가운데 집 버튼과 겹치지 않게
    this.x1 = z.x + z.w * 0.87;
    this.friendS = unit * 0.055;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.states = new Map();
    this.progress = 0;
    this.dir = 1; // 1 = 왼쪽 → 오른쪽
    this.friend = 0;
    this.foot = 'r'; // 들어 볼 다리(안내용). 건널 때마다 바뀐다.
    this.wobble = 0;
    this.balancing = false;
    this.stopT = 0;
    this.stepT = 0;
    this.half = false;
    this.tapT = 0;
    this.lastVoice = -Infinity;
    this.lastCheer = -Infinity;
    this.state = 'intro';
    this.after(speak('친구가 다리를 건너요. 한 발을 들고, 비행기처럼 팔을 쭉 펴 볼까요?'), () => (this.state = 'cross'));
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

  // 보호자·PC 테스트용: 누르면 1초 동안 균형 잡는 것으로 친다.
  onTap() {
    this.tapT = 1;
  }

  update(dt, input) {
    const t = this.game.time;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.tapT = Math.max(0, this.tapT - dt);

    // 아이마다 균형 상태와 '계속 버틴 시간'을 따로 잰다.
    let any = this.tapT > 0;
    for (const { pose, state: s, lost } of perPerson(this.states, input.people)) {
      const side = lost ? null : balanceOf(pose);
      if (side) {
        if (s.side !== side) s.cont = 0;
        s.side = side;
        s.grace = GRACE;
        s.cont = (s.cont ?? 0) + dt;
        this.record(side, s.cont);
      } else {
        s.grace = (s.grace ?? 0) - dt;
        if (s.grace > 0) s.cont = (s.cont ?? 0) + dt;
        else s.cont = 0;
      }
      if (s.grace > 0) any = true;
    }

    const wasBalancing = this.balancing;
    this.balancing = any && this.state === 'cross';
    this.wobble += ((this.balancing || this.state !== 'cross' ? 0 : 1) - this.wobble) * Math.min(1, dt * 6);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.nextCrossing();
      }
      return;
    }
    if (this.state !== 'cross') return;

    if (this.balancing) {
      this.stats.balanceTime += dt;
      this.progress += dt / CROSS_TIME;
      this.stopT = 0;
      this.stepT += dt;
      if (this.stepT >= STEP_EVERY) {
        this.stepT = 0;
        sfx.twinkle();
        const p = this.friendPos();
        this.game.particles.burst(p.x, this.logY - this.game.unit * 0.02, { count: 4, colors: [COLORS.yellow, '#fff'], speed: this.game.unit * 0.15, size: this.game.unit * 0.01, shape: 'star', gravity: 80, life: 0.6 });
      }
      if (!wasBalancing && t - this.lastCheer > CHEER_GAP && t - this.lastVoice > 2 && this.progress > 0.05) {
        this.lastCheer = t;
        speak(pick(CHEERS));
      }
      if (!this.half && this.progress >= 0.5) {
        this.half = true;
        this.lastCheer = t;
        speak('잘한다! 조금만 더!');
      }
      if (this.progress >= 1) this.arrive();
    } else {
      this.stopT += dt;
      if (this.stopT > STOP_VOICE_AFTER && t - this.lastVoice > VOICE_GAP) {
        this.lastVoice = t;
        speak(this.progress > 0 ? '친구가 흔들흔들! 다시 한 발을 들어 줘요!' : '한 발을 들고 팔을 쭉 펴요!');
      }
    }
  }

  // 가장 오래 버틴 시간을 쪽마다 기록한다(든 다리의 반대쪽 발로 서 있는 것).
  record(side, cont) {
    const st = this.stats;
    if (side === 'l') st.standRight = Math.max(st.standRight, cont);
    else if (side === 'r') st.standLeft = Math.max(st.standLeft, cont);
    else st.airplane = Math.max(st.airplane, cont);
  }

  arrive() {
    this.state = 'arrived';
    this.stats.crossings++;
    this.pulse[this.score] = 1;
    this.score++;
    sfx.success();
    const p = this.friendPos();
    const { particles, unit } = this.game;
    particles.burst(p.x, p.y - this.friendS, { count: 36, colors: [COLORS.yellow, '#fff', COLORS.pink, COLORS.green], speed: unit * 0.6, size: unit * 0.02, shape: 'star', gravity: 200 });
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 4;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('다섯 번 모두 건넜어요! 균형 대장!'), () => {});
      return;
    }
    this.after(speak('건넜어요! 이번엔 다른 발!'), () => this.nextCrossing());
  }

  nextCrossing() {
    this.progress = 0;
    this.half = false;
    this.dir = -this.dir;
    this.friend = (this.friend + 1) % FRIENDS.length;
    this.foot = this.foot === 'r' ? 'l' : 'r';
    this.stopT = 0;
    this.state = 'cross';
    sfx.bloop();
  }

  friendPos() {
    const k = Math.min(1, this.progress);
    const x = this.dir > 0 ? this.x0 + (this.x1 - this.x0) * k : this.x1 - (this.x1 - this.x0) * k;
    return { x, y: this.logY - this.game.unit * 0.022 - this.friendS };
  }

  draw(ctx) {
    const { zone: z, unit, time } = this.game;
    this.drawStream(ctx, z, unit, time);

    // 동물 친구: 균형 잡는 동안 통통 걸어가고, 멈추면 발밑을 축으로 흔들흔들
    const p = this.friendPos();
    const s = this.friendS;
    const foot = p.y + s;
    const walking = this.balancing && this.state === 'cross';
    const bob = walking ? Math.abs(Math.sin(time * 9)) * s * 0.15 : 0;
    const tilt = Math.sin(time * 7) * 0.32 * this.wobble + (walking ? Math.sin(time * 9) * 0.06 : 0);
    if (walking) {
      ctx.fillStyle = 'rgba(255,230,128,0.45)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(p.x, foot - bob);
    ctx.rotate(tilt);
    // 균형 잡는 막대(친구도 팔을 벌린 느낌)
    ctx.strokeStyle = '#8B5E3C';
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 1.7, -s * 0.9);
    ctx.lineTo(s * 1.7, -s * 0.9);
    ctx.stroke();
    if (this.dir < 0) ctx.scale(-1, 1);
    FRIENDS[this.friend](ctx, 0, -s, s, time);
    ctx.restore();
    // 흔들릴 때 '어어?' 땀방울
    if (this.wobble > 0.5) {
      ctx.fillStyle = '#8ECAE6';
      const dx = p.x + s * 1.1;
      const dy = p.y - s * 1.1 + Math.sin(time * 6) * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(dx, dy - s * 0.3);
      ctx.quadraticCurveTo(dx + s * 0.22, dy, dx, dy + s * 0.12);
      ctx.quadraticCurveTo(dx - s * 0.22, dy, dx, dy - s * 0.3);
      ctx.fill();
    }

    this.drawHint(ctx, z, unit, time);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  // 시냇물, 양쪽 풀밭, 통나무 다리
  drawStream(ctx, z, unit, time) {
    const top = this.logY - unit * 0.01;
    const bottom = z.y + z.h;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    ctx.fillStyle = 'rgba(102,190,255,0.55)';
    ctx.fillRect(z.x, top, z.w, bottom - top);
    // 흐르는 물결
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = unit * 0.006;
    ctx.lineCap = 'round';
    const gap = unit * 0.12;
    for (let row = 0; row < 3; row++) {
      const y = top + (bottom - top) * (0.3 + row * 0.25);
      const off = ((time * unit * 0.08 * (row % 2 ? 1 : 1.3)) % gap) - gap;
      for (let x = z.x + off + row * gap * 0.4; x < z.x + z.w; x += gap) {
        ctx.beginPath();
        ctx.arc(x, y, unit * 0.025, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }
    // 풀밭(양쪽 둑)
    ctx.fillStyle = 'rgba(155,216,138,0.95)';
    for (const [x, w] of [[z.x, this.bankW], [z.x + z.w - this.bankW, this.bankW]]) {
      ctx.beginPath();
      ctx.roundRect(x - unit * 0.05, top - unit * 0.03, w + unit * 0.1, bottom - top + unit * 0.06, unit * 0.06);
      ctx.fill();
    }
    ctx.restore();

    // 통나무
    const th = unit * 0.045;
    const lx = z.x + this.bankW * 0.45;
    const rx = z.x + z.w - this.bankW * 0.45;
    ctx.fillStyle = '#A0693F';
    ctx.beginPath();
    ctx.roundRect(lx, this.logY - th / 2, rx - lx, th, th / 2);
    ctx.fill();
    ctx.strokeStyle = '#7A4E2D';
    ctx.lineWidth = unit * 0.005;
    for (let x = lx + th * 2; x < rx - th * 2; x += th * 3.2) {
      ctx.beginPath();
      ctx.moveTo(x, this.logY - th * 0.12);
      ctx.lineTo(x + th * 1.4, this.logY - th * 0.12);
      ctx.stroke();
    }
    for (const x of [lx, rx]) {
      ctx.fillStyle = '#E9C893';
      ctx.beginPath();
      ctx.ellipse(x, this.logY, th * 0.32, th * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 도착할 쪽 깃발
    const fx = this.dir > 0 ? this.x1 + unit * 0.02 : this.x0 - unit * 0.02;
    const fy = this.logY - unit * 0.02;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = unit * 0.006;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - unit * 0.12);
    ctx.stroke();
    ctx.fillStyle = COLORS.red;
    ctx.beginPath();
    ctx.moveTo(fx, fy - unit * 0.12);
    ctx.lineTo(fx - this.dir * unit * 0.06 * (1 + Math.sin(time * 5) * 0.08), fy - unit * 0.1);
    ctx.lineTo(fx, fy - unit * 0.08);
    ctx.fill();
  }

  // 오른쪽 위(왼쪽 위는 집 버튼 자리): 따라 할 자세(한 발 들고 비행기 팔) + 이번 다리 건너기 진행 표시
  drawHint(ctx, z, unit, time) {
    const r = Math.min(z.w * 0.1, z.h * 0.17);
    const x = z.x + z.w - r * 1.25;
    const y = z.y + r * 1.35;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // 거울처럼 보이게: 아이의 왼다리는 화면 왼쪽(legUp -1)
    const legUp = this.foot === 'l' ? -1 : 1;
    const sway = this.balancing ? 0 : Math.sin(time * 4) * 0.06;
    ctx.save();
    ctx.translate(x, y + r * 0.08);
    ctx.rotate(sway);
    kid(ctx, 0, 0, r * 0.36, { ...POSE_SHAPES.flamingo, legUp, color: COLORS.green });
    ctx.restore();
    if (this.state === 'cross' || this.state === 'arrived') progressRing(ctx, x, y, r * 0.93, Math.min(1, this.progress), COLORS.green);
    if (this.balancing) star(ctx, x + r * 0.7, y - r * 0.7, r * 0.18 * (1 + Math.sin(time * 8) * 0.15), COLORS.yellow, '#fff');
  }
}

// ---- 놀이 설명(통나무 위를 건너는 친구 + 한 발로 선 아이) ----
const loop = (t, period) => (t % period) / period;

export const guide = {
  text: '한 발을 들고 비행기처럼 팔을 쭉 펴요. 그대로 있으면 친구가 다리를 건너가요!',
  demo: (ctx, s, t) => {
    const p = loop(t, 5);
    const balance = p < 0.75; // 마지막엔 발을 내려서 친구가 멈추는 것도 보여 준다
    const legUp = Math.floor(t / 5) % 2 ? -1 : 1;
    // 물과 통나무
    ctx.fillStyle = 'rgba(102,190,255,0.6)';
    ctx.fillRect(-s * 8, s * 2.0, s * 16, s * 3);
    ctx.fillStyle = '#A0693F';
    ctx.beginPath();
    ctx.roundRect(-s * 1.2, s * 1.75, s * 7, s * 0.55, s * 0.27);
    ctx.fill();
    const k = Math.min(p, 0.75) / 0.75;
    const fx = -s * 0.4 + k * s * 5.2;
    ctx.save();
    ctx.translate(fx, s * 1.75);
    ctx.rotate(balance ? Math.sin(t * 9) * 0.05 : Math.sin(t * 9) * 0.3);
    ctx.strokeStyle = '#8B5E3C';
    ctx.lineWidth = s * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 1.3, -s * 0.7);
    ctx.lineTo(s * 1.3, -s * 0.7);
    ctx.stroke();
    rabbit(ctx, 0, -s * 0.8, s * 0.8, t);
    ctx.restore();
    ctx.save();
    ctx.translate(-s * 3.9, s * 0.2);
    ctx.rotate(balance ? Math.sin(t * 3) * 0.04 : 0);
    kid(ctx, 0, 0, s * 1.15, balance ? { ...POSE_SHAPES.flamingo, legUp } : { hands: [[-0.7, 0.4], [0.7, 0.4]] });
    ctx.restore();
    if (balance) star(ctx, -s * 2.0, -s * 2.0, s * 0.3 * (1 + Math.sin(t * 8) * 0.15), COLORS.yellow, '#fff');
  },
};

// 메뉴 아이콘: 시냇물 위 통나무를 건너는 토끼
export function menuIcon(ctx, r, t) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#8ECAE6';
  ctx.fillRect(-r, r * 0.3, r * 2, r);
  ctx.restore();
  ctx.fillStyle = '#A0693F';
  ctx.beginPath();
  ctx.roundRect(-r * 0.75, r * 0.2, r * 1.5, r * 0.16, r * 0.08);
  ctx.fill();
  ctx.save();
  ctx.translate(0, r * 0.2);
  ctx.rotate(Math.sin(t * 3) * 0.15);
  ctx.strokeStyle = '#8B5E3C';
  ctx.lineWidth = r * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.32);
  ctx.lineTo(r * 0.5, -r * 0.32);
  ctx.stroke();
  rabbit(ctx, 0, -r * 0.25, r * 0.22, t);
  ctx.restore();
}
