import { progressRing, star, COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { perPerson, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick, shuffle } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 8; // 글자를 이만큼 만들면 축하
const HOLD = 1.0; // 글자 모양을 이만큼(초) 유지하면 성공
const EASY_AFTER = 10; // 이 시간(초) 동안 못 만들면 판정을 너그럽게(EASY_K) 하고 다시 안내
const EASY_K = 1.35; // 너그러운 판정 배율(필요한 거리는 나누고, 봐주는 범위는 곱한다)
const LOST_GRACE = 0.25; // 유지하다 잠깐 흐트러져도 이 시간(초)은 봐준다
const PRAISE = ['좋아요!', '멋져요!', '최고예요!', '잘했어요!'];

// ---- 판정 ----
// 화면은 거울처럼 보이므로 '화면에 보이는 글자 모양' 그대로 판정한다(아이 몸의 왼쪽·오른쪽이 아니라 화면 좌우).
// 모든 거리는 어깨너비(sw) 배수라 아이 키·거리와 상관없다.
function body(pose) {
  const sh = shoulders(pose);
  if (!sh) return null;
  const arm = (s, e, w) => ({ S: pose[s], E: visible(pose[e], 0.35) ? pose[e] : null, W: visible(pose[w], 0.35) ? pose[w] : null });
  const a = arm(P.lShoulder, P.lElbow, P.lWrist);
  const b = arm(P.rShoulder, P.rElbow, P.rWrist);
  const [L, R] = a.S.x < b.S.x ? [a, b] : [b, a]; // 화면 왼쪽 팔, 오른쪽 팔
  const hips = [pose[P.lHip], pose[P.rHip]].filter((p) => visible(p, 0.4));
  const hipY = hips.length ? hips.reduce((s, p) => s + p.y, 0) / hips.length : sh.my + sh.sw * 2.2;
  return { sw: sh.sw, mx: sh.mx, my: sh.my, hipY, L, R };
}

// 팔이 몸 바깥쪽(화면 왼팔은 왼쪽, 오른팔은 오른쪽)으로 뻗은 정도와 어깨 기준 높이(+ 아래)
const outOf = (g, arm) => (arm === g.R ? arm.W.x - arm.S.x : arm.S.x - arm.W.x) / g.sw;
const dyOf = (g, arm) => (arm.W.y - arm.S.y) / g.sw;
const horiz = (g, arm, k) => !!arm.W && outOf(g, arm) > 1.1 / k && Math.abs(dyOf(g, arm)) < 0.6 * k;
const notHoriz = (g, arm) => !arm.W || outOf(g, arm) < 0.8 || Math.abs(dyOf(g, arm)) > 0.7;
const up = (g, arm, k) => !!arm.W && dyOf(g, arm) < -0.9 / k && Math.abs(arm.W.x - arm.S.x) / g.sw < 1.0 * k;
const downDiag = (g, arm, k) => !!arm.W && dyOf(g, arm) > 0.35 / k && outOf(g, arm) > 0.5 / k;
// 위팔은 옆으로, 아래팔은 아래로 꺾은 팔(ㄱ). 화면 오른쪽 팔로 만든다.
const bentDown = (g, arm, k) =>
  !!arm.W && !!arm.E && (arm.E.x - arm.S.x) / g.sw > 0.6 / k && Math.abs(arm.E.y - arm.S.y) / g.sw < 0.7 * k && (arm.W.y - arm.E.y) / g.sw > 0.4 / k && Math.abs(arm.W.x - arm.E.x) / g.sw < 0.7 * k;
// 위팔은 아래로, 아래팔은 화면 오른쪽으로 꺾은 팔(ㄴ). 어느 팔이든 된다.
const bentRight = (g, arm, k) =>
  !!arm.W && !!arm.E && (arm.E.y - arm.S.y) / g.sw > 0.5 / k && (arm.W.x - arm.E.x) / g.sw > 0.5 / k && Math.abs(arm.W.y - arm.E.y) / g.sw < 0.6 * k;
// 두 손이 모두 몸 한쪽(dir: 1 = 화면 오른쪽)으로 나란히 뻗었는지(ㅑ·ㅕ)
function bothSide(g, dir, k) {
  const { L, R } = g;
  if (!L.W || !R.W) return false;
  const far = dir > 0 ? R : L;
  const side = (p) => ((p.x - g.mx) * dir) / g.sw > 0.6 / k && Math.abs(p.y - g.my) / g.sw < 1.3 * k;
  return side(L.W) && side(R.W) && Math.abs(L.W.y - R.W.y) / g.sw > 0.35 / k && outOf(g, far) > 0.9 / k;
}

// ---- 글자 ----
// demo: 시범 친구 자세(kid() 좌표, s 단위) + 그 위에 덧그리는 글자 획(strokes) / 동그라미(ring)
// match: 판정, strokes: 아이 몸 위에 덧그리는 글자 획(화면 좌표 선분 목록)
const torso = (g) => [{ x: g.mx, y: g.my - g.sw * 0.9 }, { x: g.mx, y: g.hipY }];
const fromTorso = (g, w) => [{ x: g.mx, y: w.y }, w];

const LETTERS = {
  ㄱ: {
    name: '기역',
    word: '기차의 기',
    color: COLORS.red,
    demo: { hands: [[-0.6, 0.5], [1.3, 0.5]], elbows: [null, [1.3, -0.45]], strokes: [[[0.42, -0.45], [1.3, -0.45], [1.3, 0.5]]] },
    voice: '한 팔을 옆으로 뻗고, 팔꿈치를 아래로 꺾어요!',
    match: (g, k) => bentDown(g, g.R, k),
    strokes: (g) => [[g.R.S, g.R.E, g.R.W]],
  },
  ㄴ: {
    name: '니은',
    word: '나비의 나',
    color: COLORS.orange,
    demo: { hands: [[-0.6, 0.5], [1.4, 0.3]], elbows: [null, [0.6, 0.3]], strokes: [[[0.42, -0.45], [0.6, 0.3], [1.4, 0.3]]] },
    voice: '팔꿈치를 아래로 내리고, 손을 옆으로 쭉 뻗어요!',
    match: (g, k) => bentRight(g, g.L, k) || bentRight(g, g.R, k),
    strokes: (g, k) => {
      const arm = bentRight(g, g.R, k) ? g.R : g.L;
      return [[arm.S, arm.E, arm.W]];
    },
  },
  ㅅ: {
    name: '시옷',
    word: '사자의 사',
    color: COLORS.green,
    demo: { hands: [[-1.1, 0.6], [1.1, 0.6]], strokes: [[[0, -1.0], [-1.1, 0.6]], [[0, -1.0], [1.1, 0.6]]] },
    voice: '두 팔을 아래로 비스듬히 쫙 벌려요!',
    match: (g, k) => downDiag(g, g.L, k) && downDiag(g, g.R, k),
    strokes: (g) => {
      const top = { x: g.mx, y: g.my - g.sw * 0.6 };
      return [[top, g.L.W], [top, g.R.W]];
    },
  },
  ㅇ: {
    name: '이응',
    word: '오리의 오',
    color: COLORS.blue,
    demo: { hands: [[-0.1, -2.0], [0.1, -2.0]], elbows: [[-1.0, -1.4], [1.0, -1.4]], ring: [0, -1.45, 0.8] },
    voice: '두 팔을 머리 위로 동그랗게 모아요!',
    match: (g, k) => {
      const { L, R } = g;
      if (!L.W || !R.W) return false;
      const close = Math.hypot(L.W.x - R.W.x, L.W.y - R.W.y) / g.sw < 1.0 * k;
      const high = dyOf(g, L) < -0.6 / k && dyOf(g, R) < -0.6 / k;
      const wide = !L.E || !R.E || Math.abs(L.E.x - R.E.x) / g.sw > 1.5 / k;
      return close && high && wide;
    },
    ring: (g) => {
      const top = Math.min(g.L.W.y, g.R.W.y);
      const r = Math.max(g.sw * 0.6, (g.my - top) / 2);
      return { x: g.mx, y: top + r, r };
    },
  },
  ㅣ: {
    name: '이',
    word: '이빨의 이',
    color: COLORS.purple,
    demo: { hands: [[-0.15, -2.1], [0.15, -2.1]], strokes: [[[0, 1.0], [0, -2.1]]] },
    voice: '두 팔을 머리 위로 쭉 뻗어서 길쭉하게!',
    // 팔꿈치가 벌어지면 ㅇ 이므로, 팔꿈치가 보이면 머리 옆에 붙어 있어야 한다.
    match: (g, k) => up(g, g.L, k) && up(g, g.R, k) && (!g.L.E || !g.R.E || Math.abs(g.L.E.x - g.R.E.x) / g.sw < 1.5 * k),
    strokes: (g) => [[{ x: g.mx, y: g.hipY }, { x: (g.L.W.x + g.R.W.x) / 2, y: Math.min(g.L.W.y, g.R.W.y) }]],
  },
  ㅜ: {
    name: '우',
    word: '우유의 우',
    color: COLORS.blue,
    demo: { hands: [[-1.5, -0.45], [1.5, -0.45]], strokes: [[[-1.5, -0.45], [1.5, -0.45]], [[0, -0.45], [0, 1.0]]] },
    voice: '두 팔을 옆으로 쭉 펴요!',
    match: (g, k) => horiz(g, g.L, k) && horiz(g, g.R, k),
    strokes: (g) => [[g.L.W, g.R.W], [{ x: g.mx, y: (g.L.W.y + g.R.W.y) / 2 }, { x: g.mx, y: g.hipY }]],
  },
  ㅏ: {
    name: '아',
    word: '아기의 아',
    color: COLORS.red,
    demo: { hands: [[-0.6, 0.5], [1.5, -0.45]], strokes: [[[0, -1.6], [0, 1.0]], [[0, -0.45], [1.5, -0.45]]] },
    voice: '이쪽 팔 하나만 옆으로 쭉 뻗어요!',
    // 다른 손까지 같은 쪽으로 뻗으면 ㅑ 이므로 다른 손은 몸 이쪽으로 넘어오지 않아야 한다.
    match: (g, k) => horiz(g, g.R, k) && notHoriz(g, g.L) && (!g.L.W || g.L.W.x < g.mx + g.sw * 0.3),
    strokes: (g) => [torso(g), fromTorso(g, g.R.W)],
  },
  ㅓ: {
    name: '어',
    word: '어흥의 어',
    color: COLORS.orange,
    demo: { hands: [[-1.5, -0.45], [0.6, 0.5]], strokes: [[[0, -1.6], [0, 1.0]], [[0, -0.45], [-1.5, -0.45]]] },
    voice: '이번엔 반대쪽 팔 하나만 옆으로 쭉!',
    match: (g, k) => horiz(g, g.L, k) && notHoriz(g, g.R) && (!g.R.W || g.R.W.x > g.mx - g.sw * 0.3),
    strokes: (g) => [torso(g), fromTorso(g, g.L.W)],
  },
  ㅑ: {
    name: '야',
    word: '야구의 야',
    color: COLORS.green,
    demo: { hands: [[0.9, 0.05], [1.5, -0.75]], strokes: [[[0, -1.6], [0, 1.0]], [[0, -0.75], [1.5, -0.75]], [[0, 0.05], [0.9, 0.05]]] },
    voice: '두 팔을 모두 이쪽으로 나란히 뻗어요!',
    match: (g, k) => bothSide(g, 1, k),
    strokes: (g) => [torso(g), fromTorso(g, g.L.W), fromTorso(g, g.R.W)],
  },
  ㅕ: {
    name: '여',
    word: '여우의 여',
    color: COLORS.purple,
    demo: { hands: [[-1.5, -0.75], [-0.9, 0.05]], strokes: [[[0, -1.6], [0, 1.0]], [[0, -0.75], [-1.5, -0.75]], [[0, 0.05], [-0.9, 0.05]]] },
    voice: '두 팔을 모두 반대쪽으로 나란히 뻗어요!',
    match: (g, k) => bothSide(g, -1, k),
    strokes: (g) => [torso(g), fromTorso(g, g.L.W), fromTorso(g, g.R.W)],
  },
};

const MODES = {
  consonant: { letters: ['ㄱ', 'ㄴ', 'ㅅ', 'ㅇ'], kind: '자음', celebrate: '자음 박사! 몸으로 글자를 정말 잘 만들었어요!' },
  // 쉬운 모음부터, 뒤에 ㅑ·ㅕ
  vowel: { letters: ['ㅣ', 'ㅜ', 'ㅏ', 'ㅓ'], later: ['ㅑ', 'ㅕ'], kind: '모음', celebrate: '모음 박사! 몸으로 글자를 정말 잘 만들었어요!' },
};

// 시범 친구(+ 글자 획)를 그린다. 글자 획은 친구 몸 위에 겹쳐 '몸이 글자가 되는 것'을 보여 준다.
function drawDemo(ctx, x, y, s, letter, t, strokeAlpha = 0.85) {
  const L = LETTERS[letter];
  kid(ctx, x, y, s, { hands: L.demo.hands, elbows: L.demo.elbows, color: '#FFB86B' });
  ctx.save();
  ctx.globalAlpha = strokeAlpha * (0.75 + 0.25 * Math.sin(t * 4));
  ctx.strokeStyle = L.color;
  ctx.lineWidth = s * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of L.demo.strokes ?? []) {
    ctx.beginPath();
    line.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * s, y + py * s) : ctx.moveTo(x + px * s, y + py * s)));
    ctx.stroke();
  }
  if (L.demo.ring) {
    const [cx, cy, r] = L.demo.ring;
    ctx.beginPath();
    ctx.arc(x + cx * s, y + cy * s, r * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLetter(ctx, x, y, size, letter, color) {
  ctx.save();
  ctx.font = `900 ${size}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size * 0.12;
  ctx.strokeText(letter, x, y);
  ctx.fillStyle = color;
  ctx.fillText(letter, x, y);
  ctx.restore();
}

// 몸으로 한글 만들기: 화면에 나온 자음·모음을 팔과 몸으로 만든다. 아이 몸 위에 글자 획이 그려진다.
// mode: 'consonant'(ㄱ·ㄴ·ㅅ·ㅇ) | 'vowel'(ㅣ·ㅜ·ㅏ·ㅓ, 뒤에 ㅑ·ㅕ). 아이 두 명 중 누가 만들어도 된다.
export class BodyLetterScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.blue;

  constructor(game, mode) {
    this.game = game;
    this.mode = MODES[mode];
    this.states = new Map();
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.letter = null;
    this.queue = [];
    this.matches = [];
    this.states = new Map();
    this.state = 'intro';
    this.after(speak(`몸으로 ${this.mode.kind}을 만들어 봐요!`), () => this.next());
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

  // 같은 글자가 연달아 나오지 않게 섞어서 차례로. 모음은 반쯤 지나면 ㅑ·ㅕ도 섞는다.
  next() {
    if (!this.queue.length) {
      const pool = [...this.mode.letters, ...(this.score >= GOAL / 2 ? this.mode.later ?? [] : [])];
      this.queue = shuffle(pool);
      if (this.queue[0] === this.letter) this.queue.push(this.queue.shift());
    }
    this.letter = this.queue.shift();
    this.matches = [];
    this.state = 'make';
    this.t = 0;
    this.hold = 0;
    this.lostT = 0;
    this.easy = false;
    const L = LETTERS[this.letter];
    sfx.peek();
    this.after(speak(`${L.name}! ${L.voice}`), () => {});
  }

  onTap() {
    if (this.state === 'make') this.success();
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
        this.next();
      }
      return;
    }
    this.matches = [];
    if (this.state !== 'make') return;

    this.t += dt;
    if (!this.easy && this.t > EASY_AFTER) {
      // 잘 안 되면 판정을 너그럽게 하고 다시 알려 준다(혼내지 않는다).
      this.easy = true;
      const L = LETTERS[this.letter];
      this.after(speak(`천천히 해 봐요. ${L.voice}`), () => {});
    }
    const k = this.easy ? EASY_K : 1;
    const L = LETTERS[this.letter];
    for (const p of perPerson(this.states, input.people)) {
      if (p.lost) continue;
      const g = body(p.pose);
      if (g && L.match(g, k)) this.matches.push({ g, k, id: p.id });
    }
    if (this.matches.length) {
      this.hold += dt;
      this.lostT = 0;
      if (this.hold >= HOLD) this.success();
    } else {
      this.lostT += dt;
      if (this.lostT > LOST_GRACE) this.hold = Math.max(0, this.hold - dt * 2);
    }
  }

  success() {
    const L = LETTERS[this.letter];
    const { particles, unit, zone: z } = this.game;
    sfx.success();
    sfx.sparkle();
    const at = this.matches[0]?.g ?? { mx: z.x + z.w / 2, my: z.y + z.h / 2 };
    particles.burst(at.mx, at.my, { count: 34, colors: [L.color, COLORS.yellow, '#fff'], speed: unit * 0.7, size: unit * 0.022, shape: 'star', gravity: 150 });
    this.pulse[this.score] = 1;
    this.score++;
    this.state = 'done';
    this.doneT = 0;
    if (this.score >= GOAL) {
      this.after(speak(`${L.name}! ${this.mode.celebrate}`), () => {});
      this.state = 'celebrate';
      this.stateT = 4.5;
      this.fireT = 0;
      sfx.fanfare();
      return;
    }
    // 만든 글자를 읽어 주고(예: "기역! 기차의 기!") 다음 글자로
    this.after(speak(`${pick(PRAISE)} ${L.name}! ${L.word}!`), () => this.next());
  }

  draw(ctx) {
    const { unit, zone: z, time } = this.game;
    if (!this.letter) {
      starGauge(ctx, this.game, GOAL, this.score, this.pulse);
      return;
    }
    const L = LETTERS[this.letter];

    // 아이 몸 위에 글자 획: 모양이 맞으면 진하게 그려 '내 몸이 글자가 됐다'를 보여 준다.
    for (const m of this.matches) this.drawBodyStrokes(ctx, m, L);

    // 오른쪽 위 카드: 큰 글자 + 시범 친구
    const cw = Math.min(unit * 0.34, z.w * 0.3);
    const ch = cw * 1.25;
    const cx = z.x + z.w - cw / 2 - unit * 0.02;
    const cy = z.y + ch / 2 + unit * 0.09;
    const done = this.state === 'done' || this.state === 'celebrate';
    const bounce = done ? 1 + Math.sin(time * 10) * 0.05 : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, cw * 0.1);
    ctx.fill();
    ctx.strokeStyle = L.color;
    ctx.lineWidth = unit * 0.008;
    ctx.stroke();
    ctx.restore();
    drawLetter(ctx, cx - cw * 0.24, cy - ch * 0.2, cw * 0.44 * bounce, this.letter, L.color);
    drawDemo(ctx, cx + cw * 0.2, cy - ch * 0.02, cw * 0.15, this.letter, time);
    // 아래쪽: 유지 진행 표시
    if (this.state === 'make') {
      progressRing(ctx, cx, cy + ch * 0.32, cw * 0.1, Math.min(1, this.hold / HOLD), L.color);
      ctx.fillStyle = this.hold > 0 ? L.color : 'rgba(61,44,46,0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy + ch * 0.32, cw * 0.06, 0, Math.PI * 2);
      ctx.fill();
    } else if (done) {
      star(ctx, cx, cy + ch * 0.32, cw * 0.1, COLORS.yellow, '#F4A100');
    }

    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  drawBodyStrokes(ctx, m, L) {
    const { g, k } = m;
    const a = 0.45 + 0.55 * Math.min(1, this.hold / HOLD);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = L.color;
    ctx.lineWidth = g.sw * 0.38;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (L.ring) {
      const r = L.ring(g);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      for (const line of L.strokes(g, k)) {
        ctx.beginPath();
        line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---- 메뉴·설명 ----
const loop = (t, period) => (t % period) / period;

function guideFor(mode) {
  const letters = mode === 'consonant' ? ['ㄱ', 'ㅅ', 'ㅇ'] : ['ㅏ', 'ㅜ', 'ㅣ'];
  return {
    text:
      mode === 'consonant'
        ? '화면에 나온 자음을 팔과 몸으로 만들어요. 친구 모습을 보고 똑같이 따라 하고, 잠깐 멈춰요!'
        : '화면에 나온 모음을 팔과 몸으로 만들어요. 친구 모습을 보고 똑같이 따라 하고, 잠깐 멈춰요!',
    demo: (ctx, s, t) => {
      const letter = letters[Math.floor(t / 2.5) % letters.length];
      const L = LETTERS[letter];
      const p = loop(t, 2.5);
      drawLetter(ctx, -s * 3.2, -s * 0.3, s * 3.2 * (p > 0.6 ? 1.1 : 1), letter, L.color);
      drawDemo(ctx, s * 2.2, s * 0.6, s * 1.15, letter, t, p > 0.35 ? 0.9 : 0.25);
      if (p > 0.6) {
        ctx.fillStyle = COLORS.yellow;
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3 + t;
          ctx.beginPath();
          ctx.arc(-s * 3.2 + Math.cos(ang) * s * 2, -s * 0.3 + Math.sin(ang) * s * 2, s * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  };
}

export const consonantGuide = guideFor('consonant');
export const vowelGuide = guideFor('vowel');

const iconFor = (letter) => (ctx, r, t) => {
  drawDemo(ctx, r * 0.22, r * 0.2, r * 0.27, letter, t);
  drawLetter(ctx, -r * 0.4, -r * 0.25, r * 0.62, letter, LETTERS[letter].color);
};
export const consonantIcon = iconFor('ㄱ');
export const vowelIcon = iconFor('ㅏ');
