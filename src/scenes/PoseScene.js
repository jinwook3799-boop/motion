import { progressRing, COLORS, RAINBOW } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { poseKid } from '../engine/scenery.js';
import { armPoint, legsVisible, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 5;
const HOLD = 1.0; // 자세를 이만큼(초) 유지하면 성공
const PRAISE = ['좋아요!', '멋져요!', '최고예요!', '잘했어요!'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 자세 판정. 모두 어깨너비(sw) 기준이라 아이 키·거리와 상관없다. 손이 화면 밖이면 팔꿈치로 대신 본다.
function arms(pose) {
  const sh = shoulders(pose);
  const l = armPoint(pose, 'l');
  const r = armPoint(pose, 'r');
  if (!sh || !l || !r) return null;
  const nose = pose[P.nose];
  const head = visible(nose, 0.4) ? nose.y : sh.my - sh.sw * 0.6;
  return { sh, l, r, head };
}

const POSES = [
  {
    id: 'hooray',
    voice: '두 팔을 번쩍 들어서 만세!',
    match: (a) => a.l.y < a.head && a.r.y < a.head,
  },
  {
    id: 'airplane',
    voice: '두 팔을 옆으로 쭉 펴서 비행기!',
    match: (a) => Math.abs(a.l.y - a.sh.my) < a.sh.sw * 0.5 && Math.abs(a.r.y - a.sh.my) < a.sh.sw * 0.5 && Math.abs(a.l.x - a.r.x) > a.sh.sw * 2.2,
  },
  {
    id: 'oneHand',
    voice: '한 손만 번쩍 들어 볼까요?',
    match: (a) => (a.l.y < a.head && a.r.y > a.sh.my) || (a.r.y < a.head && a.l.y > a.sh.my),
  },
  {
    id: 'heart',
    voice: '두 손을 머리 위로 모아서 하트!',
    match: (a) => a.l.y < a.head && a.r.y < a.head && dist(a.l, a.r) < a.sh.sw * 0.7,
  },
  {
    id: 'star',
    voice: '팔을 위로 쫙 벌려서 별 모양!',
    match: (a) => a.l.y < a.sh.my - a.sh.sw * 0.2 && a.r.y < a.sh.my - a.sh.sw * 0.2 && Math.abs(a.l.x - a.r.x) > a.sh.sw * 1.8,
  },
  {
    id: 'flamingo',
    voice: '한 발을 들고 홍학처럼 서 볼까요?',
    needsLegs: true,
    match: (a, pose) => {
      const lk = pose[P.lKnee];
      const rk = pose[P.rKnee];
      const la = pose[P.lAnkle];
      const ra = pose[P.rAnkle];
      if (visible(lk) && visible(rk) && Math.abs(lk.y - rk.y) > a.sh.sw * 0.35) return true;
      return visible(la) && visible(ra) && Math.abs(la.y - ra.y) > a.sh.sw * 0.5;
    },
  },
];

// 포즈 따라 하기
export class PoseScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.purple;

  constructor(game) {
    this.game = game;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.legsSeenAt = -Infinity;
    this.state = 'intro';
    this.current = null;
    this.after(speak('친구가 하는 자세를 똑같이 따라 해 봐요!'), () => this.next());
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

  next() {
    if (this.score >= GOAL) this.score = 0;
    // 한 발 들기는 다리가 화면에 보일 때만 낸다.
    const legsOk = this.game.time - this.legsSeenAt < 3;
    this.current = pick(POSES.filter((p) => p !== this.current && (!p.needsLegs || legsOk)));
    this.hold = 0;
    this.idle = 0;
    this.state = 'pose';
    this.after(speak(this.current.voice), () => {});
  }

  onTap() {
    if (this.state === 'pose') this.hold = HOLD;
  }

  update(dt, input) {
    const t = this.game.time;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    if (input.pose && legsVisible(input.pose)) this.legsSeenAt = t;

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) this.next();
      return;
    }
    if (this.state !== 'pose') return;

    const a = input.pose && arms(input.pose);
    const ok = a && this.current.match(a, input.pose);
    this.hold = ok ? this.hold + dt : Math.max(0, this.hold - dt * 0.6);
    this.idle = ok ? 0 : this.idle + dt;
    if (this.idle > 9) {
      this.idle = 0;
      this.after(speak(this.current.voice), () => {});
    }
    if (this.hold >= HOLD) this.success();
  }

  success() {
    this.state = 'done';
    this.pulse[this.score] = 1;
    this.score++;
    sfx.success();
    const { w, h, unit } = this.game;
    this.game.particles.burst(w / 2, h / 2, { count: 40, colors: RAINBOW, speed: unit * 0.8, size: unit * 0.02, shape: 'confetti' });
    if (this.score >= GOAL) {
      sfx.fanfare();
      this.after(speak('포즈 박사! 정말 멋져요!'), () => {});
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      return;
    }
    this.after(speak(pick(PRAISE)), () => this.next());
  }

  draw(ctx) {
    const { zone: z, unit } = this.game;
    if (this.current) {
      // 왼쪽: 따라 할 자세를 보여 주는 친구 + 유지 진행 표시
      const x = z.x + z.w * 0.16;
      const y = z.y + z.h * 0.5;
      const r = Math.min(z.w * 0.15, z.h * 0.42);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      poseKid(ctx, x, y + r * 0.08, r * 0.33, this.current.id, this.game.time);
      if (this.state === 'pose') progressRing(ctx, x, y, r * 0.93, Math.min(1, this.hold / HOLD), COLORS.green);
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }
}
