import { progressRing, COLORS, RAINBOW } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { poseKid } from '../engine/scenery.js';
import { armPoint, legsVisible, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick, shuffle } from '../engine/util.js';
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
  // 얼굴 가운데(손으로 얼굴을 가리면 코가 안 보일 수 있어 어깨로 짐작)
  const face = visible(nose, 0.2) ? nose : { x: sh.mx, y: sh.my - sh.sw * 0.7 };
  const le = visible(pose[P.lElbow], 0.4) ? pose[P.lElbow] : null;
  const re = visible(pose[P.rElbow], 0.4) ? pose[P.rElbow] : null;
  return { sh, l, r, head, face, le, re };
}

// 팔꿈치가 몸 바깥으로 벌어졌는지(허리에 손 짚은 자세 등)
const elbowOut = (a, e) => e && Math.abs(e.x - a.sh.mx) > a.sh.sw * 0.85;
// 손이 허리 높이인지
const atHip = (a, p) => p.y > a.sh.my + a.sh.sw * 0.7;

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
  {
    id: 'muscle',
    voice: '두 팔을 접어 올려서 힘센 근육맨!',
    match: (a) =>
      a.le && a.re &&
      Math.abs(a.le.y - a.sh.my) < a.sh.sw * 0.6 && Math.abs(a.re.y - a.sh.my) < a.sh.sw * 0.6 &&
      Math.abs(a.le.x - a.re.x) > a.sh.sw * 1.6 &&
      a.l.y < a.le.y - a.sh.sw * 0.25 && a.r.y < a.re.y - a.sh.sw * 0.25,
  },
  {
    id: 'bunny',
    voice: '두 손을 머리 위에 올려서 쫑긋 토끼 귀!',
    match: (a) =>
      a.l.y < a.head && a.r.y < a.head &&
      dist(a.l, a.r) >= a.sh.sw * 0.6 && dist(a.l, a.r) < a.sh.sw * 1.8 &&
      Math.abs(a.l.x - a.sh.mx) < a.sh.sw && Math.abs(a.r.x - a.sh.mx) < a.sh.sw,
  },
  {
    id: 'superhero',
    voice: '두 손을 허리에 척! 씩씩한 슈퍼맨!',
    match: (a) => atHip(a, a.l) && atHip(a, a.r) && elbowOut(a, a.le) && elbowOut(a, a.re),
  },
  {
    id: 'cheeks',
    voice: '두 손으로 볼을 감싸서 예쁜 꽃받침!',
    match: (a) =>
      [a.l, a.r].every((p) => Math.abs(p.y - a.face.y) < a.sh.sw * 0.6 && Math.abs(p.x - a.face.x) < a.sh.sw * 0.9) &&
      dist(a.l, a.r) > a.sh.sw * 0.6,
  },
  {
    id: 'peekaboo',
    voice: '두 손으로 눈을 가리고 까꿍!',
    match: (a) => dist(a.l, a.face) < a.sh.sw * 0.6 && dist(a.r, a.face) < a.sh.sw * 0.6 && dist(a.l, a.r) < a.sh.sw * 0.8,
  },
  {
    id: 'teapot',
    voice: '한 손은 허리에, 한 손은 옆으로 쭉! 주전자!',
    match: (a) => {
      const spout = (p) => Math.abs(p.x - a.sh.mx) > a.sh.sw * 1.4 && p.y < a.sh.my + a.sh.sw * 0.6;
      return (atHip(a, a.l) && elbowOut(a, a.le) && spout(a.r)) || (atHip(a, a.r) && elbowOut(a, a.re) && spout(a.l));
    },
  },
  {
    id: 'cross',
    voice: '두 팔을 가슴 앞에서 엇갈려서 엑스!',
    match: (a) => {
      const chest = (p) => p.y > a.sh.my - a.sh.sw * 0.3 && p.y < a.sh.my + a.sh.sw * 1.4;
      // 왼손이 오른쪽으로, 오른손이 왼쪽으로 넘어가 있으면 엇갈린 것
      const crossed = Math.sign(a.l.x - a.r.x) !== Math.sign(a.sh.ls.x - a.sh.rs.x) && Math.abs(a.l.x - a.r.x) > a.sh.sw * 0.15;
      return chest(a.l) && chest(a.r) && crossed;
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
    this.after(speak('자, 시작해요!'), () => this.next());
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
    // 모든 자세가 한 번씩 섞여 나오도록 순서를 섞어 두고 차례로 꺼낸다.
    // 한 발 들기는 다리가 화면에 보일 때만 낸다.
    const legsOk = this.game.time - this.legsSeenAt < 3;
    if (!this.queue?.length) this.queue = shuffle(POSES.filter((p) => p !== this.current));
    const i = this.queue.findIndex((p) => !p.needsLegs || legsOk);
    this.current = i >= 0 ? this.queue.splice(i, 1)[0] : pick(POSES.filter((p) => !p.needsLegs));
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
    if (input.people.some((p) => legsVisible(p.pose))) this.legsSeenAt = t;

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

    // 두 아이 중 누구라도 자세를 따라 하면 진행된다.
    const ok = input.people.some(({ pose }) => {
      const a = arms(pose);
      return a && this.current.match(a, pose);
    });
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
