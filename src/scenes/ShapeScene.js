import { progressRing, star, COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { shuffle } from '../engine/util.js';
import { drawNeedTwo, firework, leftToRight, PLAYER_COLORS } from './common.js';

const GOAL = 6; // 이만큼 만들면 크게 축하
const HOLD = 1.0; // 모양을 이만큼(초) 유지하면 성공
const TOUCH = 1.0; // 두 손이 이 거리(어깨너비 배) 안이면 '맞댔다'고 본다 — 손목끼리라 넉넉하게
const LENIENT_AFTER = 8; // 이 시간(초)이 지나도 못 만들면 더 쉬운 동작도 인정하고 다시 안내
const ALONE_HINT_FIRST = 6; // 혼자일 때 처음 "친구랑 같이" 안내까지(초)
const ALONE_HINT_GAP = 30; // 그 뒤로는 이 간격(초)마다 가끔
const NEED_TWO_SHOW = 3; // 친구 안내 그림을 보여 주는 시간(초)
const PRAISE = ['우와, 멋진', '정말 잘 만든', '반짝반짝'];

const NAMES = { triangle: '세모', circle: '동그라미', square: '네모' };
const SHAPE_COLORS = { triangle: COLORS.green, circle: COLORS.pink, square: COLORS.blue };
// 모양별 음성 안내(둘이 할 때 / 혼자 할 때)
const VOICE = {
  triangle: { two: '세모를 만들어요! 친구랑 머리 위에서 손을 맞대요!', one: '세모를 만들어요! 두 손을 머리 위에서 뾰족하게 모아요!' },
  circle: { two: '동그라미를 만들어요! 친구랑 위에서 한 번, 아래에서 한 번 손을 맞대요!', one: '동그라미를 만들어요! 두 팔을 둥글게 머리 위로 모아요!' },
  square: { two: '네모를 만들어요! 친구랑 마주 보고 두 손을 어깨 높이에서 맞대요!', one: '네모를 만들어요! 팔을 접어서 두 손을 위로 올려요!' },
};
const EASY_VOICE = {
  triangle: '머리 위로 두 손을 모아 봐요!',
  circle: '친구랑 머리 위에서 손을 맞대 봐요!',
  square: '친구랑 손을 맞대 봐요!',
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const loop = (t, period) => (t % period) / period;
const lerp = (a, b, k) => a + (b - a) * k;
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

// ---- 동작 판정. 모두 어깨너비(sw) 기준이라 키·거리와 상관없다. ----

// 손(손목, 안 보이면 검지 끝)과 어깨·머리 높이
function body(pose) {
  const sh = shoulders(pose);
  if (!sh) return null;
  const hand = (w, i) => (visible(pose[w], 0.35) ? pose[w] : visible(pose[i], 0.35) ? pose[i] : null);
  const elbow = (e) => (visible(pose[e], 0.4) ? pose[e] : null);
  const nose = pose[P.nose];
  return {
    sh,
    l: hand(P.lWrist, P.lIndex),
    r: hand(P.rWrist, P.rIndex),
    le: elbow(P.lElbow),
    re: elbow(P.rElbow),
    head: visible(nose, 0.4) ? nose.y : sh.my - sh.sw * 0.6,
  };
}

// 혼자: 두 손을 머리 위에서 모으기(세모·동그라미 공통 — 팔꿈치 모양까지는 보지 않고 너그럽게)
function handsJoinedUp(b, easy) {
  if (!b.l || !b.r) return false;
  const top = easy ? b.sh.my - b.sh.sw * 0.2 : b.head;
  return b.l.y < top && b.r.y < top && dist(b.l, b.r) < b.sh.sw * (easy ? 1.2 : 0.9);
}

// 혼자 네모: 팔을 ㄴ자로 접어 두 손을 위로(골대 모양). 쉬운 판정은 두 손을 어깨 위로만 들면 된다.
function goalpost(b, easy) {
  if (!b.l || !b.r) return false;
  const { sw, my } = b.sh;
  const up = b.l.y < my - sw * 0.2 && b.r.y < my - sw * 0.2;
  if (easy) return up;
  const apart = Math.abs(b.l.x - b.r.x);
  const elbowsOk = [[b.le, b.l], [b.re, b.r]].every(([e, h]) => !e || e.y > h.y + sw * 0.15);
  return up && apart > sw * 1.0 && apart < sw * 3.4 && elbowsOk;
}

const solo = { triangle: handsJoinedUp, circle: handsJoinedUp, square: goalpost };

// 두 아이 손 사이의 맞댄 쌍
function touches(a, b) {
  const sw = (a.sh.sw + b.sh.sw) / 2;
  const list = [];
  for (const [ka, p] of [['l', a.l], ['r', a.r]]) {
    for (const [kb, q] of [['l', b.l], ['r', b.r]]) {
      if (!p || !q) continue;
      const d = dist(p, q);
      list.push({ ka, kb, d, ok: d < sw * TOUCH, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }
  }
  return { list, sw, top: Math.min(a.sh.my, b.sh.my), mid: (a.sh.my + b.sh.my) / 2 };
}

// 손 두 쌍(각자 왼손·오른손이 겹치지 않게)이 모두 맞닿은 경우들
function twoPairs(T) {
  const get = (ka, kb) => T.list.find((t) => t.ka === ka && t.kb === kb && t.ok);
  const out = [];
  for (const [x, y] of [['l', 'r'], ['r', 'l']]) {
    const p1 = get('l', x);
    const p2 = get('r', y);
    if (p1 && p2) out.push([p1, p2]);
  }
  return out;
}

const pair = {
  // 세모: 둘이 기대어 머리 위에서 손을 맞댄다(한 쌍이면 충분)
  triangle: (T) => T.list.some((t) => t.ok && t.y < T.top - T.sw * 0.4),
  // 동그라미: 위에서 한 쌍, 그보다 아래에서 한 쌍
  circle: (T) =>
    twoPairs(T).some(([p, q]) => Math.min(p.y, q.y) < T.top - T.sw * 0.2 && Math.abs(p.y - q.y) > T.sw * 0.8),
  // 네모: 두 쌍 모두 어깨 높이 근처
  square: (T) => twoPairs(T).some((ps) => ps.every((t) => Math.abs(t.y - T.mid) < T.sw * 0.9)),
};
// 오래 못 만들면 받아 주는 쉬운 동작(둘이 할 때)
const pairEasy = {
  triangle: () => false,
  circle: (T) => T.list.some((t) => t.ok && t.y < T.top - T.sw * 0.1),
  square: (T) => T.list.some((t) => t.ok && Math.abs(t.y - T.mid) < T.sw * 1.0),
};

// ---- 모양 그림 ----

// 도형 테두리. (0,0) 가운데, s = 크기 단위(세모·네모는 높이 약 2s)
function shapePath(ctx, shape, x, y, s, wScale = 1) {
  ctx.beginPath();
  if (shape === 'triangle') {
    ctx.moveTo(x, y - s * 1.05);
    ctx.lineTo(x + s * 1.15 * wScale, y + s * 0.85);
    ctx.lineTo(x - s * 1.15 * wScale, y + s * 0.85);
    ctx.closePath();
  } else if (shape === 'circle') {
    ctx.ellipse(x, y, s * wScale, s, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(x - s * 1.0 * wScale, y - s * 0.85, s * 2.0 * wScale, s * 1.7, s * 0.08);
  }
}

// 몸으로 만든 모양 시범: 친구(들)의 손 위치와 그 둘레의 도형. k: 0 = 차렷, 1 = 완성
const REST = [[-0.7, 0.4], [0.7, 0.4]];
const REST_ELBOW = [[-0.6, 0], [0.6, 0]];
const FIGURES = {
  triangle: {
    two: { kids: [{ x: -1.2, hands: [[-0.7, 0.4], [1.15, -1.95]], elbows: [null, [0.75, -1.15]] }], outline: [0, -0.3, 2.05, 1.05] },
    one: { kids: [{ x: 0, hands: [[-0.08, -2.05], [0.08, -2.05]], elbows: [[-0.95, -1.15], [0.95, -1.15]] }], outline: [0, -0.4, 2.0, 0.72] },
  },
  circle: {
    two: { kids: [{ x: -1.25, hands: [[1.2, 0.1], [1.2, -1.75]], elbows: [[0.55, 0.45], [0.55, -2.05]] }], outline: [0, -0.55, 1.95, 1.0] },
    one: { kids: [{ x: 0, hands: [[-0.1, -1.95], [0.1, -1.95]], elbows: [[-1.0, -1.55], [1.0, -1.55]] }], outline: [0, -1.3, 1.08, 1.0] },
  },
  square: {
    two: { kids: [{ x: -1.55, hands: [[1.5, -0.95], [1.5, -0.35]], elbows: [[0.8, -0.55], [0.8, -0.2]] }], outline: [0, 0.22, 1.25, 1.24] },
    one: { kids: [{ x: 0, hands: [[-0.95, -1.85], [0.95, -1.85]], elbows: [[-1.05, -0.5], [1.05, -0.5]] }], outline: [0, -1.18, 0.82, 1.2] },
  },
};

// 시범 그림 한 장: 도형 테두리 + 그 모양을 만든 친구(들)
function figure(ctx, s, shape, two, k, t = 0, fill = 0) {
  const f = FIGURES[shape][two ? 'two' : 'one'];
  const [ox, oy, os, ow] = f.outline;
  const color = SHAPE_COLORS[shape];
  // 도형(완성될수록 진해짐)
  ctx.save();
  shapePath(ctx, shape, ox * s, oy * s, os * s, ow);
  ctx.globalAlpha = 0.15 + fill * 0.35;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.14;
  ctx.lineJoin = 'round';
  if (k < 1) ctx.setLineDash([s * 0.3, s * 0.22]);
  ctx.stroke();
  ctx.restore();

  const kids = two ? [f.kids[0], mirrorKid(f.kids[0])] : f.kids;
  const colors = two ? PLAYER_COLORS : [COLORS.orange];
  kids.forEach((c, i) => {
    const hands = c.hands.map((h, j) => lerp2(REST[j], h, k));
    const elbows = c.elbows.map((e, j) => (e ? lerp2(REST_ELBOW[j], e, k) : null));
    kid(ctx, c.x * s, s * 0.05 + Math.sin(t * 3 + i) * s * 0.03, s, { hands, elbows, color: colors[i] });
  });
}

// 왼쪽 친구 모양을 좌우로 뒤집어 오른쪽 친구로
function mirrorKid(c) {
  const flip = (p) => (p ? [-p[0], p[1]] : null);
  return { x: -c.x, hands: [flip(c.hands[1]), flip(c.hands[0])], elbows: [flip(c.elbows[1]), flip(c.elbows[0])] };
}

// 도형 몸으로 만들기: 화면의 세모·동그라미·네모를 친구와 함께(또는 혼자) 몸으로 만든다.
export class ShapeScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  avatarColorOf(person) {
    const i = this.order.indexOf(person.id);
    return PLAYER_COLORS[Math.max(0, i) % 2];
  }

  onResize() {
    const { unit, zone: z } = this.game;
    // 오른쪽 위 안내 카드(무슨 모양인지 + 어떻게 만드는지)
    this.cardS = unit * 0.034;
    this.cardW = this.cardS * 6.4;
    this.cardH = this.cardS * 5.6;
    this.cardX = z.x + z.w - this.cardW - unit * 0.02;
    this.cardY = z.y + unit * 0.02;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.order = [];
    this.queue = [];
    this.shape = null;
    this.progress = 0;
    this.marks = [];
    this.aloneT = 0;
    this.nextAloneHint = ALONE_HINT_FIRST;
    this.needTwoT = 0;
    this.after(speak('몸으로 모양을 만들어요!'), () => this.next());
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

  get two() {
    return this.order.length >= 2;
  }

  next() {
    if (!this.queue.length) this.queue = shuffle(['triangle', 'circle', 'square']);
    if (this.queue[0] === this.shape) this.queue.push(this.queue.shift());
    this.shape = this.queue.shift();
    this.progress = 0;
    this.shapeT = 0;
    this.easy = false;
    this.state = 'play';
    sfx.peek();
    speak(VOICE[this.shape][this.two ? 'two' : 'one']);
  }

  // 보호자·PC 테스트용: 화면을 누르면 모양 완성
  onTap() {
    if (this.state === 'play') this.success();
  }

  update(dt, input) {
    this.t += dt;
    this.needTwoT = Math.max(0, this.needTwoT - dt);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    const people = leftToRight(input.people).slice(0, 2);
    this.order = people.map((p) => p.id);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.next();
      }
      return;
    }

    const bodies = people.map((p) => body(p.pose)).filter(Boolean);
    this.bodies = bodies;
    this.marks = [];
    if (this.state !== 'play') return;
    this.shapeT += dt;

    // 오래 못 만들면 쉬운 동작도 받아 주고 다시 알려 준다.
    if (!this.easy && this.shapeT > LENIENT_AFTER) {
      this.easy = true;
      speak(`괜찮아요! ${EASY_VOICE[this.shape]}`);
    }

    const ok = this.judge(bodies);
    if (ok) this.progress += dt / HOLD;
    else this.progress = Math.max(0, this.progress - dt * 0.8); // 잠깐 흔들려도 바로 0이 되지 않게
    if (ok && Math.random() < dt * 8) sfx.twinkle();
    if (this.progress >= 1) return this.success();

    // 혼자일 때 가끔 친구와 함께 하자고 알려 준다.
    this.aloneT = bodies.length === 1 ? this.aloneT + dt : 0;
    if (this.aloneT > this.nextAloneHint && this.progress === 0) {
      this.nextAloneHint = this.aloneT + ALONE_HINT_GAP;
      this.needTwoT = NEED_TWO_SHOW;
      speak('친구랑 같이 하면 더 재미있어요!', { interrupt: false });
    }
  }

  judge(bodies) {
    const shape = this.shape;
    if (bodies.length >= 2) {
      const T = touches(bodies[0], bodies[1]);
      for (const t of T.list) if (t.ok && !this.marks.some((m) => dist(m, t) < T.sw * 0.4)) this.marks.push(t);
      if (pair[shape](T)) return true;
      if (this.easy && (pairEasy[shape](T) || bodies.some((b) => solo[shape](b, true)))) return true;
      return false;
    }
    if (bodies.length === 1) {
      const b = bodies[0];
      if (b.l && b.r && dist(b.l, b.r) < b.sh.sw * TOUCH) this.marks = [{ x: (b.l.x + b.r.x) / 2, y: (b.l.y + b.r.y) / 2 }];
      return solo[shape](b, this.easy);
    }
    return false;
  }

  success() {
    const { particles, unit } = this.game;
    const f = this.frame();
    sfx.success();
    sfx.sparkle(0.1);
    particles.burst(f.x, f.y, { count: 50, colors: [SHAPE_COLORS[this.shape], COLORS.yellow, '#fff'], speed: unit * 0.8, size: unit * 0.022, shape: 'star', gravity: 150 });
    particles.ring(f.x, f.y, { color: SHAPE_COLORS[this.shape], size: f.s });
    this.pulse[this.score] = 1;
    this.score++;
    this.progress = 1;
    this.state = 'done';
    this.doneT = 0;
    const all = this.score >= GOAL;
    this.after(speak(`${PRAISE[Math.floor(Math.random() * PRAISE.length)]} ${NAMES[this.shape]}!`), () => {
      if (!all) return this.next();
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      speak('모양 만들기 대장들! 정말 잘했어요!');
    });
  }

  // 아이들 둘레에 그리는 커다란 도형 위치(아이가 안 보이면 놀이 영역 가운데)
  frame() {
    const { zone: z, unit } = this.game;
    const bodies = this.bodies ?? [];
    if (!bodies.length) return { x: z.x + z.w / 2, y: z.y + z.h * 0.45, s: unit * 0.28, ws: 1 };
    const sw = bodies.reduce((n, b) => n + b.sh.sw, 0) / bodies.length;
    const xs = bodies.map((b) => b.sh.mx);
    const x = (Math.max(...xs) + Math.min(...xs)) / 2;
    const span = Math.max(...xs) - Math.min(...xs);
    const my = bodies.reduce((n, b) => n + b.sh.my, 0) / bodies.length;
    // 모양마다 몸을 둘러싸는 자리: 세모·동그라미는 머리 위까지, 네모는 둘이 맞댄 팔 아래 몸통(혼자면 머리와 팔 둘레)
    if (this.shape === 'square') {
      if (bodies.length >= 2) {
        const s = sw * 1.1;
        return { x, y: my + sw * 0.55, s, ws: Math.max(1, (span + sw * 1.1) / (s * 2)) };
      }
      return { x, y: my - sw * 0.55, s: sw * 0.95, ws: 1.15 };
    }
    if (this.shape === 'circle' && bodies.length < 2) return { x, y: my - sw * 0.75, s: sw * 1.1, ws: 1 };
    const s = sw * 1.6;
    return { x, y: my - sw * 0.35, s, ws: Math.max(1, (span + sw * 1.8) / (s * 2)) };
  }

  draw(ctx) {
    const { unit } = this.game;
    if (this.shape && this.state !== 'intro') {
      // 아이들 둘레의 커다란 도형(완성될수록 진해지고 실선이 된다)
      const f = this.frame();
      const color = SHAPE_COLORS[this.shape];
      const k = Math.min(1, this.progress);
      const wobble = 1 + (this.state === 'done' ? Math.sin(this.t * 10) * 0.03 : 0);
      ctx.save();
      shapePath(ctx, this.shape, f.x, f.y, f.s * wobble, f.ws);
      ctx.globalAlpha = 0.08 + k * 0.25;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 0.55 + k * 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = unit * 0.014;
      ctx.lineJoin = 'round';
      if (k < 1) ctx.setLineDash([unit * 0.03, unit * 0.022]);
      ctx.lineDashOffset = -this.t * unit * 0.05;
      ctx.stroke();
      ctx.restore();

      // 맞댄 손에 반짝이 별
      for (const m of this.marks) {
        const r = unit * 0.03 * (1 + Math.sin(this.t * 10) * 0.12);
        star(ctx, m.x, m.y, r, COLORS.yellow, '#fff');
      }
      this.drawCard(ctx);
    }
    if (this.needTwoT > 0 && this.state === 'play') drawNeedTwo(ctx, this.game, 1);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  // 오른쪽 위 카드: 만들 모양과 만드는 방법(친구 그림)
  drawCard(ctx) {
    const { cardX: x, cardY: y, cardW: w, cardH: h, cardS: s } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, s * 0.8);
    ctx.fill();
    ctx.strokeStyle = SHAPE_COLORS[this.shape];
    ctx.lineWidth = s * 0.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, s * 0.8);
    ctx.clip();
    ctx.translate(x + w / 2, y + h * 0.55);
    const k = this.state === 'done' ? 1 : ease(Math.min(1, loop(this.t, 2.6) * 1.6));
    figure(ctx, s * 0.95, this.shape, this.two, k, this.t, Math.min(1, this.progress));
    ctx.restore();
    // 유지 진행 표시: 카드 아래 동그라미
    const cx = x + w / 2;
    const cy = y + h + s * 1.4;
    if (this.progress > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2);
      ctx.fill();
      star(ctx, cx, cy, s * 0.6, COLORS.yellow, '#fff');
      progressRing(ctx, cx, cy, s * 0.9, Math.min(1, this.progress), SHAPE_COLORS[this.shape]);
    }
  }
}

// ---- 놀이 설명(동작 + 음성) ----
export const guide = {
  text: '세모, 동그라미, 네모! 친구랑 손을 맞대서 몸으로 모양을 만들어요.',
  demo: (ctx, s, t) => {
    const shapes = ['triangle', 'circle', 'square'];
    const period = 3;
    const shape = shapes[Math.floor(t / period) % shapes.length];
    const p = loop(t, period);
    const k = ease(Math.min(1, p / 0.45));
    figure(ctx, s * 1.05, shape, true, k, t, p > 0.6 ? 1 : 0);
    if (p > 0.6) {
      for (let i = 0; i < 6; i++) {
        const a = t * 1.5 + (i * Math.PI) / 3;
        star(ctx, Math.cos(a) * s * 3.2, -s * 0.4 + Math.sin(a) * s * 2.3, s * 0.2, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// ---- 메뉴 아이콘: 세모·동그라미·네모 ----
export function menuIcon(ctx, r, t = 0) {
  const bob = (i) => Math.sin(t * 3 + i * 1.3) * r * 0.04;
  ctx.lineWidth = r * 0.09;
  ctx.lineJoin = 'round';
  const items = [
    ['triangle', 0, -r * 0.3],
    ['circle', -r * 0.33, r * 0.28],
    ['square', r * 0.33, r * 0.28],
  ];
  items.forEach(([shape, x, y], i) => {
    shapePath(ctx, shape, x, y + bob(i), r * 0.24);
    ctx.fillStyle = SHAPE_COLORS[shape];
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = SHAPE_COLORS[shape];
    ctx.stroke();
  });
}
