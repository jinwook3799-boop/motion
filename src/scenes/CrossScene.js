import { star, COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { shoulders, visible, P } from '../engine/pose.js';
import { sweepDist } from '../engine/hit.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework } from './common.js';

const GOAL = 10;
// 손 색: 왼손 = 파랑, 오른손 = 분홍(아이 몸 기준. 거울 화면에서 왼손은 화면 왼쪽에 보인다)
const HAND_COLOR = { l: COLORS.blue, r: COLORS.pink };
const HAND_LIGHT = { l: '#CFE1FF', r: '#FCD3EA' };
// 별 자리(어깨너비 배, 어깨 가운데 기준). 별은 '반대쪽' 손이 몸 가운데를 넘어가야 닿는 쪽에 둔다.
const OFFSET_X = [0.6, 1.1]; // 몸 가운데에서 옆으로
const OFFSET_Y = [-0.6, 0.9]; // 어깨 높이에서 위(-)/아래(+)로. 너무 낮으면 늘어뜨린 같은 쪽 손에 닿아 버린다
const TARGET_R = 0.38; // 별 크기(어깨너비 배)
const TOUCH_PAD = 0.3; // 별 둘레에서 이만큼(어깨너비 배) 더 가까우면 닿은 것(유아용으로 넉넉하게)
const FOLLOW_DEAD = 0.8; // 아이가 이만큼(어깨너비 배) 넘게 옆으로 움직이면 별도 따라간다
const FOLLOW_SPEED = 2; // 따라가는 빠르기
const HINT_AFTER = 6; // 이 시간(초) 안에 못 잡으면 맞는 손에서 별까지 화살표
const WRONG_SOUND_GAP = 1.2; // 다른 손으로 닿았을 때 소리 최소 간격(초)
const WRONG_VOICE_GAP = 6; // "반대쪽 손으로!" 음성 최소 간격(초)
const SPAWN_DELAY = 500; // 별을 잡고 다음 별이 나오기까지(ms)
const DEFAULT_SW = 0.13; // 아이가 안 보일 때 쓰는 어깨너비(화면 짧은 변 배)

const POINTER = /^p(\d+)-([lr])[wi]$/; // Game 이 붙인 몸 손 포인터 key(p{id}-lw, -rw, -li, -ri)
const sideName = { l: '파란 손', r: '분홍 손' };

// 아이 기준 '오른쪽'이 화면에서 어느 방향인지(+1 = 화면 오른쪽). 거울 화면이면 보통 +1.
function rightDir(sh) {
  return Math.sign(sh.rs.x - sh.ls.x) || 1;
}

// 손바닥 그림(왼손은 엄지가 화면 왼쪽, 오른손은 오른쪽)
function hand(ctx, x, y, r, side, fill, line = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  if (side === 'r') ctx.scale(-1, 1);
  ctx.fillStyle = fill;
  ctx.strokeStyle = line;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.roundRect(-r * 0.36, -r * 0.05, r * 0.72, r * 0.62, r * 0.22);
  for (const [dx, len] of [[-0.26, 0.42], [-0.09, 0.52], [0.09, 0.5], [0.26, 0.4]]) {
    ctx.roundRect(dx * r - r * 0.08, -r * 0.05 - len * r, r * 0.16, len * r + r * 0.15, r * 0.08);
  }
  ctx.stroke();
  ctx.fill();
  ctx.save();
  ctx.translate(-r * 0.38, r * 0.15);
  ctx.rotate(-0.7);
  ctx.beginPath();
  ctx.roundRect(-r * 0.08, -r * 0.32, r * 0.16, r * 0.42, r * 0.08);
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// 손 색 표시가 있는 별 방울
function targetBubble(ctx, x, y, r, side, t, wiggle = 0) {
  ctx.save();
  ctx.translate(x + Math.sin(t * 40) * r * 0.15 * wiggle, y);
  ctx.rotate(Math.sin(t * 30) * 0.3 * wiggle);
  const k = (Math.sin(t * 4) + 1) / 2;
  ctx.fillStyle = `rgba(255,255,255,${0.35 + k * 0.2})`;
  ctx.beginPath();
  ctx.arc(0, 0, r * (1.35 + k * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HAND_LIGHT[side];
  ctx.strokeStyle = HAND_COLOR[side];
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  star(ctx, 0, -r * 0.05, r * 0.62, HAND_COLOR[side], '#fff');
  // 어느 손으로 잡는지: 같은 색 손 그림
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.72, r * 0.72, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  hand(ctx, r * 0.72, r * 0.74, r * 0.5, side, HAND_COLOR[side]);
  ctx.restore();
}

// 좌우 교차 터치: 파란 별은 왼손(파랑), 분홍 별은 오른손(분홍)으로. 별은 반대쪽에 나와서 손이 몸 가운데를 넘어가야 한다.
// 맞는 손이면 펑! 다른 손이면 별이 흔들흔들(벌점 없음). 두 명이면 별을 번갈아 각자 앞에 띄우고, 누구든 맞는 손으로 잡으면 된다.
export class CrossScene {
  tracker = 'pose';
  showAvatar = true;
  hideCursor = true; // 손 표시는 이 장면이 손 색으로 직접 그린다
  avatarColorOf = (person) => (person.id % 2 ? COLORS.orange : COLORS.green);

  constructor(game) {
    this.game = game;
    // 보호자 리포트용(메모리에만): 손별 성공 수, 다른 손으로 닿은 수, 손별 평균 걸린 시간 계산용 합계(초)
    this.stats = { left: 0, right: 0, wrong: 0, leftTime: 0, rightTime: 0 };
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.target = null;
    this.lastSide = null;
    this.spawned = 0;
    this.lastWrongSound = -Infinity;
    this.lastWrongVoice = -Infinity;
    this.state = 'intro';
    this.after(speak('파란 별은 파란 손으로, 분홍 별은 분홍 손으로 콕!'), () => this.spawn());
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

  // 별을 띄울 기준(아이의 어깨). 아이가 안 보이면 화면 가운데.
  anchorOf(person) {
    const sh = person && shoulders(person.pose);
    const { w, h, unit } = this.game;
    if (!sh) return { x: w / 2, y: h * 0.45, sw: unit * DEFAULT_SW, dir: 1 };
    return { x: sh.mx, y: sh.my, sw: sh.sw, dir: rightDir(sh) };
  }

  spawn() {
    const people = this.game.people.filter((p) => !p.lost);
    const owner = people.length ? people[this.spawned % people.length] : null;
    this.spawned++;
    // 같은 손이 세 번 넘게 이어지지 않게, 대체로 번갈아
    let side = Math.random() < 0.7 && this.lastSide ? (this.lastSide === 'l' ? 'r' : 'l') : Math.random() < 0.5 ? 'l' : 'r';
    if (this.lastSide === side && this.sameCount >= 2) side = side === 'l' ? 'r' : 'l';
    this.sameCount = side === this.lastSide ? (this.sameCount ?? 0) + 1 : 1;
    this.lastSide = side;
    const anchor = this.anchorOf(owner);
    const rnd = ([a, b]) => a + Math.random() * (b - a);
    this.target = {
      side,
      owner: owner?.id ?? null,
      anchor,
      // 왼손 별은 아이의 오른쪽(+), 오른손 별은 왼쪽(-)
      ox: (side === 'l' ? 1 : -1) * rnd(OFFSET_X),
      oy: rnd(OFFSET_Y),
      age: 0,
      wiggle: 0,
    };
    this.state = 'play';
    sfx.peek();
  }

  // 별 위치(화면). 놀이 영역 밖이나 집 버튼(왼쪽 위) 자리는 피한다.
  targetPos() {
    const o = this.target;
    const a = o.anchor;
    const { zone: z, unit, homeButton: hb } = this.game;
    const r = Math.max(unit * 0.045, a.sw * TARGET_R);
    let x = a.x + o.ox * a.dir * a.sw;
    let y = a.y + o.oy * a.sw;
    x = Math.max(z.x + r * 1.4, Math.min(z.x + z.w - r * 1.4, x));
    y = Math.max(z.y + unit * 0.16 + r, Math.min(z.y + z.h - r * 1.4, y));
    if (hb && Math.hypot(x - hb.x, y - hb.y) < hb.r + r * 1.6) y = hb.y + hb.r + r * 1.6;
    return { x, y, r };
  }

  onTap(x, y) {
    if (this.state !== 'play') return;
    const p = this.targetPos();
    if (Math.hypot(x - p.x, y - p.y) < p.r * 2) this.pop(this.target.side);
  }

  update(dt, input) {
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.spawn();
      }
      return;
    }
    if (this.state !== 'play') return;
    const o = this.target;
    o.age += dt;
    o.wiggle = Math.max(0, o.wiggle - dt * 2);

    // 아이가 옆으로 걸어가면 별도 따라가서 늘 몸 가운데를 넘어가야 하는 자리에 있게 한다.
    // (손을 뻗느라 몸이 조금 기우는 정도로는 움직이지 않는다)
    const people = input.people.filter((p) => !p.lost);
    const owner = people.find((p) => p.id === o.owner) ?? people[0];
    if (owner) {
      const a = this.anchorOf(owner);
      if (o.owner !== owner.id) {
        o.owner = owner.id;
        o.anchor = a;
      } else if (Math.abs(a.x - o.anchor.x) > a.sw * FOLLOW_DEAD || Math.abs(a.y - o.anchor.y) > a.sw * FOLLOW_DEAD) {
        o.following = true;
      }
      if (o.following) {
        const k = Math.min(1, dt * FOLLOW_SPEED);
        o.anchor = { x: o.anchor.x + (a.x - o.anchor.x) * k, y: o.anchor.y + (a.y - o.anchor.y) * k, sw: o.anchor.sw + (a.sw - o.anchor.sw) * k, dir: a.dir };
        if (Math.hypot(a.x - o.anchor.x, a.y - o.anchor.y) < a.sw * 0.1) o.following = false;
      }
    }

    const p = this.targetPos();
    const reach = p.r + o.anchor.sw * TOUCH_PAD;
    let wrong = false;
    for (const q of input.pointers) {
      if (sweepDist(q, p.x, p.y) >= reach) continue;
      if (q.key === 'mouse') return this.pop(o.side);
      const m = POINTER.exec(q.key);
      if (!m) continue;
      if (m[2] === o.side) return this.pop(o.side);
      wrong = true;
    }
    if (wrong) this.wrongHand();
  }

  wrongHand() {
    const t = this.game.time;
    this.target.wiggle = 1;
    if (t - this.lastWrongSound < WRONG_SOUND_GAP) return;
    this.lastWrongSound = t;
    this.stats.wrong++;
    sfx.boing();
    if (t - this.lastWrongVoice > WRONG_VOICE_GAP) {
      this.lastWrongVoice = t;
      speak(`반대쪽 손으로! ${sideName[this.target.side]}!`);
    }
    // 화살표 힌트도 바로 보여 준다.
    this.target.age = Math.max(this.target.age, HINT_AFTER);
  }

  pop(side) {
    const p = this.targetPos();
    const { particles, unit } = this.game;
    sfx.pop();
    sfx.sparkle();
    particles.burst(p.x, p.y, { count: 30, colors: [HAND_COLOR[side], '#fff', COLORS.yellow], speed: unit * 0.6, size: unit * 0.02, shape: 'star', gravity: 150 });
    particles.ring(p.x, p.y, { color: HAND_COLOR[side], size: p.r });
    if (side === 'l') {
      this.stats.left++;
      this.stats.leftTime += this.target.age;
    } else {
      this.stats.right++;
      this.stats.rightTime += this.target.age;
    }
    this.pulse[this.score] = 1;
    this.score++;
    this.target = null;
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('별 열 개 성공! 손 바꾸기 대장!'), () => {});
      return;
    }
    this.state = 'wait';
    this.after(new Promise((resolve) => setTimeout(resolve, SPAWN_DELAY)), () => this.spawn());
  }

  draw(ctx) {
    const { time } = this.game;
    // 아이 팔(팔꿈치~손목)과 손을 손 색으로 칠해 어느 손이 파랑/분홍인지 알 수 있게 한다.
    for (const person of this.game.people) this.drawHands(ctx, person.pose);

    if (this.state === 'play' && this.target) {
      const o = this.target;
      const p = this.targetPos();
      const appear = Math.min(1, o.age * 4);
      if (o.age >= HINT_AFTER) this.drawHint(ctx, o, p);
      targetBubble(ctx, p.x, p.y, p.r * appear, o.side, time, o.wiggle);
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  drawHands(ctx, pose) {
    const sh = shoulders(pose);
    if (!sh) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [side, e, w] of [['l', P.lElbow, P.lWrist], ['r', P.rElbow, P.rWrist]]) {
      const wp = pose[w];
      if (!visible(wp, 0.35)) continue;
      const ep = pose[e];
      if (visible(ep, 0.35)) {
        ctx.strokeStyle = HAND_COLOR[side];
        ctx.lineWidth = sh.sw * 0.3;
        ctx.beginPath();
        ctx.moveTo(ep.x, ep.y);
        ctx.lineTo(wp.x, wp.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, sh.sw * 0.3, 0, Math.PI * 2);
      ctx.fill();
      hand(ctx, wp.x, wp.y + sh.sw * 0.04, sh.sw * 0.36, side, HAND_COLOR[side]);
    }
    ctx.restore();
  }

  // 맞는 손에서 별까지 점선 화살표(깜빡임)
  drawHint(ctx, o, p) {
    const people = this.game.people.filter((q) => !q.lost);
    const owner = people.find((q) => q.id === o.owner) ?? people[0];
    const wp = owner?.pose[o.side === 'l' ? P.lWrist : P.rWrist];
    if (!wp || !visible(wp, 0.35)) return;
    const { unit, time } = this.game;
    const dx = p.x - wp.x;
    const dy = p.y - wp.y;
    const len = Math.hypot(dx, dy);
    if (len < p.r * 2) return;
    const ux = dx / len;
    const uy = dy / len;
    const ex = p.x - ux * p.r * 1.4;
    const ey = p.y - uy * p.r * 1.4;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.4 * Math.abs(Math.sin(time * 4));
    ctx.strokeStyle = HAND_COLOR[o.side];
    ctx.lineWidth = unit * 0.012;
    ctx.lineCap = 'round';
    ctx.setLineDash([unit * 0.02, unit * 0.025]);
    ctx.lineDashOffset = -time * unit * 0.1;
    ctx.beginPath();
    ctx.moveTo(wp.x, wp.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    const a = unit * 0.035;
    ctx.fillStyle = HAND_COLOR[o.side];
    ctx.beginPath();
    ctx.moveTo(ex + ux * a * 0.6, ey + uy * a * 0.6);
    ctx.lineTo(ex - ux * a * 0.6 - uy * a * 0.6, ey - uy * a * 0.6 + ux * a * 0.6);
    ctx.lineTo(ex - ux * a * 0.6 + uy * a * 0.6, ey - uy * a * 0.6 - ux * a * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ---- 놀이 설명: 파란 손(화면 왼쪽 손)이 몸을 넘어 오른쪽 파란 별을, 분홍 손이 왼쪽 분홍 별을 ----
const REST = [[-0.7, 0.4], [0.7, 0.4]];
const loop = (t, period) => (t % period) / period;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

// kid() 의 front(몸 앞 팔) 그림은 얼굴을 그린 뒤 선 굵기가 얇아져서, 몸 앞 팔은 여기서 다시 굵게 그린다.
function kidFront(ctx, x, y, s, shape) {
  kid(ctx, x, y, s, { ...shape, front: false });
  if (!shape.front) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.28;
  shape.hands.forEach(([hx, hy], i) => {
    const elbow = shape.elbows?.[i];
    ctx.strokeStyle = shape.color ?? COLORS.orange;
    ctx.beginPath();
    ctx.moveTo((i === 0 ? -1 : 1) * s * 0.42, -s * 0.45);
    if (elbow) ctx.lineTo(elbow[0] * s, elbow[1] * s);
    ctx.lineTo(hx * s, hy * s);
    ctx.stroke();
    ctx.fillStyle = '#FFD6A5';
    ctx.beginPath();
    ctx.arc(hx * s, hy * s, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// 손 색을 칠한 친구. hands[0] = 화면 왼쪽 손 = 아이의 왼손(파랑)
function colorKid(ctx, x, y, s, hands, color) {
  kidFront(ctx, x, y, s, { hands, color, front: true });
  hands.forEach(([hx, hy], i) => {
    const side = i === 0 ? 'l' : 'r';
    ctx.fillStyle = HAND_COLOR[side];
    ctx.beginPath();
    ctx.arc(x + hx * s, y + hy * s, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  });
}

export const guide = {
  text: '파란 별은 파란 손으로, 분홍 별은 분홍 손으로 콕! 손이 몸 반대쪽으로 넘어가요.',
  demo: (ctx, s, t) => {
    const p = loop(t, 2.6);
    const side = Math.floor(t / 2.6) % 2 ? 'r' : 'l';
    const k = p < 0.4 ? ease(p / 0.4) : p < 0.7 ? 1 : ease(1 - (p - 0.7) / 0.3);
    const hit = p >= 0.4 && p < 0.7;
    const dir = side === 'l' ? 1 : -1;
    const to = [dir * 1.3, -0.95];
    const ks = s * 1.45;
    const tx = to[0] * ks;
    const ty = s * 0.9 + to[1] * ks;
    const hands = side === 'l' ? [[lerp(REST[0][0], to[0], k), lerp(REST[0][1], to[1], k)], REST[1]] : [REST[0], [lerp(REST[1][0], to[0], k), lerp(REST[1][1], to[1], k)]];
    colorKid(ctx, 0, s * 0.9, ks, hands, COLORS.green);
    if (hit) {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        star(ctx, tx + Math.cos(a) * s * 1.0, ty + Math.sin(a) * s * 1.0, s * 0.32, i % 2 ? '#fff' : HAND_COLOR[side]);
      }
    } else targetBubble(ctx, tx, ty, s * 0.7, side, t);
    // 반대쪽에는 다른 색 별이 기다린다(흐리게)
    ctx.globalAlpha = 0.35;
    targetBubble(ctx, -tx * 1.6, ty, s * 0.55, side === 'l' ? 'r' : 'l', t);
    ctx.globalAlpha = 1;
  },
};

// 메뉴 아이콘: 엇갈린 파란 손·분홍 손과 별
export function menuIcon(ctx, r, t) {
  const k = (Math.sin(t * 2) + 1) / 2;
  star(ctx, r * 0.45, -r * 0.35, r * 0.2, COLORS.blue, '#fff');
  star(ctx, -r * 0.45, -r * 0.35, r * 0.2, COLORS.pink, '#fff');
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.12;
  // 왼손(파랑)은 왼쪽 아래에서 오른쪽 위로, 오른손(분홍)은 오른쪽 아래에서 왼쪽 위로
  const reach = 0.25 + k * 0.05;
  ctx.strokeStyle = COLORS.blue;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, r * 0.55);
  ctx.lineTo(r * reach, -r * 0.1);
  ctx.stroke();
  ctx.strokeStyle = COLORS.pink;
  ctx.beginPath();
  ctx.moveTo(r * 0.4, r * 0.55);
  ctx.lineTo(-r * reach, -r * 0.1);
  ctx.stroke();
  hand(ctx, r * reach, -r * 0.12, r * 0.28, 'l', COLORS.blue);
  hand(ctx, -r * reach, -r * 0.12, r * 0.28, 'r', COLORS.pink);
}
