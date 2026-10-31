import { bear, chick, crab, elephant, frog, gorilla, kangaroo, penguin, rabbit, turtle } from '../engine/animals.js';
import { footprint } from '../engine/icons.js';
import { COLORS, RAINBOW } from '../engine/draw.js';
import { armPoint, bodyHeight, countSteps, perPerson, P, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { shuffle } from '../engine/util.js';

// 각 감지기는 (상태, 포즈, dt) → 이번 프레임에 새로 인정된 동작 횟수.
// 기준 길이는 어깨 너비(sw)라서 아이가 카메라에서 멀든 가깝든 똑같이 동작한다.
const DETECTORS = {
  // 개구리 점프: 어깨가 평소 높이보다 확 올라갔다가 돌아오면 1회
  jump(s, pose, dt) {
    const sh = shoulders(pose);
    if (!sh) return 0;
    s.base ??= sh.my;
    if (!s.up) {
      s.base += (sh.my - s.base) * Math.min(1, dt * 2);
      if (sh.my < s.base - sh.sw * 0.2) {
        s.up = true;
        s.upT = 0;
      }
      return 0;
    }
    s.upT += dt;
    if (s.upT > 1.5) {
      s.up = false;
      s.base = sh.my;
      return 0;
    }
    if (sh.my > s.base - sh.sw * 0.07) {
      s.up = false;
      return 1;
    }
    return 0;
  },

  // 아기 새 날갯짓: 손(안 보이면 팔꿈치)이 어깨 위로 갔다가 아래로 내려오면 1회
  flap(s, pose) {
    const sh = shoulders(pose);
    if (!sh) return 0;
    const ys = [
      [P.lWrist, P.lElbow],
      [P.rWrist, P.rElbow],
    ]
      .map(([w, e]) => (visible(pose[w], 0.4) ? pose[w] : visible(pose[e], 0.4) ? pose[e] : null))
      .filter(Boolean)
      .map((p) => p.y);
    if (!ys.length) return 0;
    const y = ys.reduce((a, b) => a + b) / ys.length;
    if (y < sh.my - sh.sw * 0.05) s.pos = 'up';
    else if (y > sh.my + sh.sw * 0.35) {
      const wasUp = s.pos === 'up';
      s.pos = 'down';
      if (wasUp) return 1;
    }
    return 0;
  },

  // 펭귄 뒤뚱: 몸을 좌우로 기울이거나 옮길 때, 방향이 바뀔 때마다 1회
  waddle(s, pose, dt) {
    const sh = shoulders(pose);
    if (!sh) return 0;
    s.cx ??= sh.mx;
    s.cx += (sh.mx - s.cx) * Math.min(1, dt * 0.6);
    const [left, right] = sh.ls.x < sh.rs.x ? [sh.ls, sh.rs] : [sh.rs, sh.ls];
    const tilt = Math.atan2(right.y - left.y, right.x - left.x);
    const sway = (sh.mx - s.cx) / sh.sw;
    let side = 0;
    if (tilt > 0.15 || sway > 0.3) side = 1;
    else if (tilt < -0.15 || sway < -0.3) side = -1;
    if (side === 0 || side === s.last) return 0;
    const counted = s.last !== undefined;
    s.last = side;
    return counted ? 1 : 0;
  },

  // 토끼 귀: 두 손을 머리 위로 올리고 있는 동안 0.5초마다 1회
  ears(s, pose, dt) {
    const sh = shoulders(pose);
    const nose = pose[P.nose];
    if (!sh) return 0;
    const sideUp = ([w, e, shoulder]) =>
      visible(pose[w], 0.3) ? pose[w].y < (visible(nose, 0.4) ? nose.y : shoulder.y - sh.sw * 0.5) : visible(pose[e], 0.4) && pose[e].y < shoulder.y;
    const up = sideUp([P.lWrist, P.lElbow, sh.ls]) && sideUp([P.rWrist, P.rElbow, sh.rs]);
    return holdCount(s, up, dt);
  },

  // 곰 쿵쿵: 제자리 걸음 한 걸음마다 1회
  steps(s, pose) {
    return countSteps(s, pose);
  },

  // 코끼리 코: 아래로 내린 팔을 몸 앞에서 좌우로 흔들어 방향이 바뀔 때마다 1회
  trunk(s, pose) {
    const sh = shoulders(pose);
    if (!sh) return 0;
    const hands = [armPoint(pose, 'l'), armPoint(pose, 'r')].filter((p) => p && p.y > sh.my - sh.sw * 0.2);
    if (!hands.length) return 0;
    const off = (hands.reduce((sum, p) => sum + p.x, 0) / hands.length - sh.mx) / sh.sw;
    return alternate(s, off > 0.45 ? 1 : off < -0.45 ? -1 : 0);
  },

  // 게 옆걸음: 몸을 옆으로 크게 옮겼다 돌아올 때(방향이 바뀔 때)마다 1회
  sideways(s, pose, dt) {
    const sh = shoulders(pose);
    if (!sh) return 0;
    s.cx ??= sh.mx;
    s.cx += (sh.mx - s.cx) * Math.min(1, dt * 0.3);
    const off = (sh.mx - s.cx) / sh.sw;
    return alternate(s, off > 0.5 ? 1 : off < -0.5 ? -1 : 0);
  },

  // 거북이 숨기: 쪼그려 앉아 있는 동안 0.5초마다 1회
  hide(s, pose, dt) {
    s.height ??= {};
    return holdCount(s, bodyHeight(s.height, pose, dt) === 'down', dt);
  },

  // 고릴라 가슴 두드리기: 손이 가슴 쪽으로 들어올 때마다 1회
  chest(s, pose) {
    const sh = shoulders(pose);
    if (!sh) return 0;
    let hits = 0;
    for (const [side, w] of [['l', P.lWrist], ['r', P.rWrist]]) {
      const p = pose[w];
      const on = visible(p, 0.4) && p.y > sh.my - sh.sw * 0.1 && p.y < sh.my + sh.sw * 1.3 && Math.abs(p.x - sh.mx) < sh.sw * 0.45;
      if (on && !s[side]) hits++;
      s[side] = on;
    }
    return hits;
  },
};

// 자세를 유지하는 동안 0.5초마다 1회
function holdCount(s, on, dt) {
  if (on) s.hold = (s.hold ?? 0) + dt;
  const n = Math.floor((s.hold ?? 0) / 0.5);
  const add = n - (s.counted ?? 0);
  s.counted = n;
  return add;
}

// 왼쪽(-1)·오른쪽(1)을 번갈아 오갈 때마다 1회(처음 한쪽으로 간 것은 세지 않는다)
function alternate(s, side) {
  if (side === 0 || side === s.last) return 0;
  const counted = s.last !== undefined;
  s.last = side;
  return counted ? 1 : 0;
}

// 각 동물의 동작 시범(draw 할 때 동물 그림을 움직이는 방식)
const DEMO = {
  jump: (ctx, s, t) => ctx.translate(0, -Math.abs(Math.sin(t * 4)) * s * 0.6),
  waddle: (ctx, s, t) => ctx.rotate(Math.sin(t * 4) * 0.25),
  ears: (ctx, s) => ctx.translate(0, s * 0.2),
  steps: (ctx, s, t) => ctx.translate(Math.sin(t * 3) * s * 0.1, -Math.abs(Math.sin(t * 6)) * s * 0.15),
  trunk: (ctx, s, t) => ctx.rotate(Math.sin(t * 3) * 0.12),
  sideways: (ctx, s, t) => ctx.translate(Math.sin(t * 2.5) * s * 0.6, 0),
  hide: (ctx, s, t) => ctx.scale(1, 0.75 + Math.abs(Math.sin(t * 2)) * 0.25),
  chest: (ctx, s, t) => ctx.translate(Math.sin(t * 25) * s * 0.03, 0),
};

const ANIMALS = [
  { draw: frog, detector: 'jump', goal: 3, color: COLORS.green, voice: '개구리처럼 펄쩍! 뛰어 봐요!' },
  { draw: chick, detector: 'flap', goal: 4, color: COLORS.yellow, voice: '아기 새처럼 두 팔을 파닥파닥 흔들어 봐요!' },
  { draw: penguin, detector: 'waddle', goal: 4, color: COLORS.blue, voice: '펭귄처럼 몸을 뒤뚱뒤뚱 흔들어 봐요!' },
  { draw: rabbit, detector: 'ears', goal: 3, color: COLORS.pink, voice: '토끼처럼 두 손을 머리 위로 쫑긋 올려 봐요!' },
  { draw: bear, detector: 'steps', goal: 8, color: '#9C6B4A', voice: '곰처럼 쿵쿵 제자리에서 걸어 봐요!' },
  { draw: elephant, detector: 'trunk', goal: 4, color: '#8D99AE', voice: '코끼리처럼 팔을 코처럼 내리고 좌우로 흔들흔들!' },
  { draw: crab, detector: 'sideways', goal: 3, color: '#FF6B4A', voice: '게처럼 옆으로 옆으로 왔다 갔다 걸어 봐요!' },
  { draw: turtle, detector: 'hide', goal: 3, color: '#4FA84F', voice: '거북이처럼 쪼그려 앉아서 쏙 숨어 봐요!' },
  { draw: kangaroo, detector: 'jump', goal: 3, color: COLORS.orange, voice: '캥거루처럼 깡충깡충 뛰어 봐요!' },
  { draw: gorilla, detector: 'chest', goal: 6, color: COLORS.purple, voice: '고릴라처럼 가슴을 쿵쿵 두드려 봐요!' },
];
const ROUND = 5; // 한 판에 흉내 낼 동물 수(10마리 중 무작위)

// 모듈 2. 동물 친구 흉내 내기 릴레이
export class MimicScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  get animal() {
    return this.round[this.index];
  }

  get avatarColor() {
    return this.animal.color;
  }

  enter() {
    this.t = 0;
    this.newRound();
  }

  newRound() {
    this.round = shuffle(ANIMALS).slice(0, ROUND);
    this.index = 0;
    this.startAnimal();
  }

  startAnimal() {
    this.state = 'play';
    this.count = 0;
    this.idle = 0;
    this.det = new Map(); // 아이 id → 동작 감지 상태
    this.pulse = new Array(this.animal.goal).fill(0);
    speak(this.animal.voice);
  }

  update(dt, input) {
    this.t += dt;
    for (let i = 0; i < this.pulse.length; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    if (this.state === 'done' || this.state === 'finale') {
      this.stateT -= dt;
      if (this.state === 'finale') this.firework(dt);
      if (this.stateT > 0) return;
      if (this.state === 'finale') return this.newRound();
      if (this.index === this.round.length - 1) return this.finale();
      this.index++;
      this.startAnimal();
      return;
    }

    // 한동안 성공이 없으면 다시 알려 준다.
    this.idle += dt;
    if (this.idle > 9) {
      this.idle = 0;
      speak(this.animal.voice);
    }
    // 두 아이가 함께 흉내 내면 둘의 동작이 모두 발자국으로 쌓인다.
    let hits = 0;
    for (const p of perPerson(this.det, input.people)) hits += DETECTORS[this.animal.detector](p.state, p.pose, dt);
    for (let i = 0; i < hits && this.state === 'play'; i++) this.addCount();
  }

  addCount() {
    this.pulse[this.count] = 1;
    this.count++;
    this.idle = 0;
    sfx.footstep();
    const { x, y } = this.footprintPos(this.count - 1);
    this.game.particles.burst(x, y, { count: 12, colors: [this.animal.color, '#fff'], speed: this.game.unit * 0.4, size: this.game.unit * 0.015, shape: 'star', gravity: 300 });
    if (this.count >= this.animal.goal) {
      this.state = 'done';
      this.stateT = 2.2;
      sfx.success();
      speak('잘했어요!');
      const { w, unit } = this.game;
      this.game.particles.burst(w / 2, this.animalY, { count: 40, colors: RAINBOW, speed: unit * 0.8, size: unit * 0.02, shape: 'confetti' });
    }
  }

  finale() {
    this.state = 'finale';
    this.stateT = 4;
    this.fireT = 0;
    sfx.fanfare();
    speak('동물 친구들을 모두 흉내 냈어요! 최고예요!');
  }

  firework(dt) {
    this.fireT -= dt;
    if (this.fireT > 0) return;
    this.fireT = 0.35;
    const { zone: z, unit } = this.game;
    this.game.particles.burst(z.x + Math.random() * z.w, z.y + Math.random() * z.h * 0.6, { count: 36, colors: RAINBOW, speed: unit * 0.55, size: unit * 0.012, gravity: 150, life: 1.2 });
    sfx.pop();
  }

  get animalY() {
    return this.game.zone.y + this.game.unit * 0.14;
  }

  footprintPos(i) {
    const { w, zone: z, unit } = this.game;
    const n = this.animal.goal;
    const gap = unit * 0.13;
    return { x: w / 2 + (i - (n - 1) / 2) * gap, y: z.y + z.h - unit * 0.07 + (i % 2 ? -unit * 0.02 : unit * 0.02) };
  }

  draw(ctx) {
    const { w, unit } = this.game;
    const a = this.animal;
    const s = unit * 0.09;
    const cheer = this.state !== 'play';

    // 지금 흉내 낼 동물(동작 시범)
    ctx.save();
    ctx.translate(w / 2, this.animalY);
    if (cheer) DEMO.jump(ctx, s, this.t);
    else DEMO[a.detector]?.(ctx, s, this.t);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.6, 0, Math.PI * 2);
    ctx.fill();
    a.draw(ctx, 0, 0, s, this.t);
    ctx.restore();

    // 다음 동물 미리 보기(이번 판의 마지막 동물이면 없음)
    const next = this.round[this.index + 1];
    const nx = w / 2 + unit * 0.26;
    if (next) this.drawNext(ctx, next, nx, s);

    // 발자국 게이지
    for (let i = 0; i < a.goal; i++) {
      const { x, y } = this.footprintPos(i);
      const filled = i < this.count;
      footprint(ctx, x, y, unit * 0.035 * (1 + this.pulse[i] * 0.5), filled ? a.color : 'rgba(61,44,46,0.15)', i % 2 ? -1 : 1);
    }
  }

  drawNext(ctx, next, nx, s) {
    const { unit } = this.game;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.moveTo(nx - unit * 0.09, this.animalY - unit * 0.02);
    ctx.lineTo(nx - unit * 0.06, this.animalY);
    ctx.lineTo(nx - unit * 0.09, this.animalY + unit * 0.02);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(nx, this.animalY, s * 0.7, 0, Math.PI * 2);
    ctx.fill();
    next.draw(ctx, nx, this.animalY, s * 0.45, 0);
    ctx.restore();
  }
}
