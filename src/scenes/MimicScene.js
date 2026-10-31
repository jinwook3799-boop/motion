import { chick, frog, penguin, rabbit } from '../engine/animals.js';
import { footprint } from '../engine/icons.js';
import { COLORS, RAINBOW } from '../engine/draw.js';
import { P, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

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
    if (up) s.hold = (s.hold ?? 0) + dt;
    const n = Math.floor((s.hold ?? 0) / 0.5);
    const add = n - (s.counted ?? 0);
    s.counted = n;
    return add;
  },
};

const ANIMALS = [
  { draw: frog, detector: 'jump', goal: 3, color: COLORS.green, voice: '개구리처럼 펄쩍! 뛰어 봐요!' },
  { draw: chick, detector: 'flap', goal: 4, color: COLORS.yellow, voice: '아기 새처럼 두 팔을 파닥파닥 흔들어 봐요!' },
  { draw: penguin, detector: 'waddle', goal: 4, color: COLORS.blue, voice: '펭귄처럼 몸을 뒤뚱뒤뚱 흔들어 봐요!' },
  { draw: rabbit, detector: 'ears', goal: 3, color: COLORS.pink, voice: '토끼처럼 두 손을 머리 위로 쫑긋 올려 봐요!' },
];

// 모듈 2. 동물 친구 흉내 내기 릴레이
export class MimicScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  get animal() {
    return ANIMALS[this.index];
  }

  get avatarColor() {
    return this.animal.color;
  }

  enter() {
    this.index = 0;
    this.t = 0;
    this.startAnimal();
  }

  startAnimal() {
    this.state = 'play';
    this.count = 0;
    this.idle = 0;
    this.det = {};
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
      if (this.state === 'done' && this.index === ANIMALS.length - 1) return this.finale();
      this.index = (this.index + 1) % ANIMALS.length;
      this.startAnimal();
      return;
    }

    // 한동안 성공이 없으면 다시 알려 준다.
    this.idle += dt;
    if (this.idle > 9) {
      this.idle = 0;
      speak(this.animal.voice);
    }
    if (!input.pose) return;
    const hits = DETECTORS[this.animal.detector](this.det, input.pose, dt);
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
    if (a.detector === 'jump' || cheer) ctx.translate(0, -Math.abs(Math.sin(this.t * 4)) * s * 0.6);
    if (a.detector === 'waddle') ctx.rotate(Math.sin(this.t * 4) * 0.25);
    if (a.detector === 'ears') ctx.translate(0, s * 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.6, 0, Math.PI * 2);
    ctx.fill();
    a.draw(ctx, 0, 0, s, this.t);
    ctx.restore();

    // 다음 동물 미리 보기
    const next = ANIMALS[(this.index + 1) % ANIMALS.length];
    const nx = w / 2 + unit * 0.26;
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

    // 발자국 게이지
    for (let i = 0; i < a.goal; i++) {
      const { x, y } = this.footprintPos(i);
      const filled = i < this.count;
      footprint(ctx, x, y, unit * 0.035 * (1 + this.pulse[i] * 0.5), filled ? a.color : 'rgba(61,44,46,0.15)', i % 2 ? -1 : 1);
    }
  }
}
