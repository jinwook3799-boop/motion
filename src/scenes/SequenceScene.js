import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { questionMark, starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { legsVisible, perPerson, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { delay, pick } from '../engine/util.js';
import { firework } from './common.js';

const LENGTHS = [2, 3, 4]; // 단계별 순서 길이
const ROUNDS = 2; // 한 단계에서 이만큼 성공하면 다음 단계
const GOAL = LENGTHS.length * ROUNDS; // 별 게이지(순서 하나 성공 = 별 하나)
const SHOW_STEP = 1.5; // 친구가 부위 하나를 보여 주는 시간(초)
const HOLD = 0.3; // 손을 그 부위에 이만큼(초) 대고 있으면 인정
const WRONG_HOLD = 0.7; // 다른 부위는 이만큼 오래 대고 있어야 '틀림'으로 본다(지나가다 스친 것은 무시)
const WRONG_GAP = 4; // '틀림' 안내 최소 간격(초)
const IDLE_HINT = 7; // 이 시간(초) 동안 다음 동작을 못 하면 친구가 다시 보여 준다
// 손목이 부위 점에서 이 거리(어깨너비 배) 안이면 '댔다'
const REACH = { head: 0.65, shoulder: 0.6, belly: 0.6, knee: 0.75 };
const HEAD_UP = 0.55; // 머리 점 = 코에서 이만큼(어깨너비 배) 위
const SKY_UP = 1.3; // 두 손목이 코보다 이만큼 위면 '만세'
const BELLY_DOWN = 1.0; // 엉덩이가 안 보일 때 배 점 = 어깨 가운데에서 이만큼 아래
const PRAISE = ['딩동댕! 잘했어요!', '기억력 최고!', '와, 똑같아요!'];
const COUNT = ['', '한', '두', '세', '네', '다섯'];

const REST_HANDS = [[-0.7, 0.4], [0.7, 0.4]];
const SHOULDER_PT = [[-0.42, -0.45], [0.42, -0.45]]; // 친구 그림의 어깨 위치(kid 기준)

// 부위: 이름(음성), 친구가 만지는 모습, 친구 그림에서 반짝일 곳, 아이콘
const PARTS = {
  head: {
    voice: '머리',
    shape: { hands: [[-0.42, -1.5], [0.42, -1.5]], elbows: [[-1.0, -1.05], [1.0, -1.05]] },
    spots: [[0, -1.35]],
  },
  shoulder: {
    voice: '어깨',
    shape: { hands: [[-0.5, -0.55], [0.5, -0.55]], elbows: [[-0.95, 0.05], [0.95, 0.05]], front: true },
    spots: SHOULDER_PT,
  },
  belly: {
    voice: '배',
    shape: { hands: [[-0.2, 0.05], [0.2, 0.05]], elbows: [[-0.8, -0.1], [0.8, -0.1]], front: true },
    spots: [[0, 0.05]],
  },
  knee: {
    voice: '무릎',
    needsLegs: true,
    shape: { hands: [[-0.3, 1.0], [0.3, 1.0]], front: true },
    spots: [[-0.21, 1.0], [0.21, 1.0]],
  },
  sky: {
    voice: '만세',
    shape: { hands: [[-0.75, -1.95], [0.75, -1.95]] },
    spots: [[0, -2.2]],
  },
};
const PART_IDS = Object.keys(PARTS);

const lerp = (a, b, k) => a + (b - a) * k;
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 친구가 부위를 만지는 모습. k: 0 = 차렷, 1 = 만지고 있음
function touchShape(id, k) {
  const shape = PARTS[id].shape;
  const hands = REST_HANDS.map((h, i) => lerp2(h, shape.hands[i], k));
  const elbows = shape.elbows
    ? shape.elbows.map((e, i) => lerp2(lerp2(SHOULDER_PT[i], REST_HANDS[i], 0.5), e, k))
    : null;
  return { hands, elbows, front: k > 0.5 && shape.front };
}

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

// 친구 그림 + 만지는 곳 반짝임
function drawFriend(ctx, x, y, s, id, k, t, color = COLORS.orange) {
  if (id && k > 0.6) {
    for (const [sx, sy] of PARTS[id].spots) {
      ctx.fillStyle = `rgba(255,210,63,${0.45 + Math.sin(t * 10) * 0.15})`;
      ctx.beginPath();
      ctx.arc(x + sx * s, y + sy * s, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  kidFront(ctx, x, y, s, id ? { ...touchShape(id, k), color } : { hands: REST_HANDS, color });
}

// 부위 아이콘(순서 칸 안): 그 부위를 만지는 작은 친구
function partIcon(ctx, r, id, t) {
  drawFriend(ctx, 0, r * 0.12, r * 0.3, id, 1, t, COLORS.blue);
}

// 아이 몸의 부위 점들. 화면에 다리가 안 보이면 무릎은 없다.
function bodyPoints(pose) {
  const sh = shoulders(pose);
  if (!sh) return null;
  const nose = visible(pose[P.nose], 0.3) ? pose[P.nose] : { x: sh.mx, y: sh.my - sh.sw * 0.7 };
  const lh = pose[P.lHip];
  const rh = pose[P.rHip];
  const belly = visible(lh, 0.4) && visible(rh, 0.4)
    ? { x: (sh.mx + (lh.x + rh.x) / 2) / 2, y: lerp(sh.my, (lh.y + rh.y) / 2, 0.55) }
    : { x: sh.mx, y: sh.my + sh.sw * BELLY_DOWN };
  const knees = [P.lKnee, P.rKnee].map((i) => pose[i]).filter((p) => visible(p));
  return {
    sh,
    nose,
    pts: {
      head: [{ x: nose.x, y: nose.y - sh.sw * HEAD_UP }],
      shoulder: [sh.ls, sh.rs],
      belly: [belly],
      knee: knees,
      sky: [{ x: nose.x, y: nose.y - sh.sw * (SKY_UP + 0.3) }],
    },
  };
}

// 지금 손을 대고 있는 부위들
function touchedParts(pose) {
  const b = bodyPoints(pose);
  const out = new Set();
  if (!b) return out;
  const { sh, nose, pts } = b;
  const lw = pose[P.lWrist];
  const rw = pose[P.rWrist];
  const wrists = [lw, rw].filter((p) => visible(p, 0.35));
  if (!wrists.length) return out;
  // 만세는 두 손 모두 머리 위로. 이때는 머리를 만진 것으로 보지 않는다.
  if (wrists.length === 2 && lw.y < nose.y - sh.sw * SKY_UP && rw.y < nose.y - sh.sw * SKY_UP) {
    out.add('sky');
    return out;
  }
  for (const id of ['head', 'shoulder', 'belly', 'knee']) {
    if (pts[id].some((pt) => wrists.some((w) => dist(w, pt) < sh.sw * REACH[id]))) out.add(id);
  }
  return out;
}

// 따라 해 봐요: 친구가 보여 준 순서대로 몸의 부위를 만진다(순서 기억 + 신체 부위 이름).
// 순서 길이는 2 → 3 → 4 로 늘어난다. 틀려도 벌점 없이 남은 순서를 다시 알려 준다.
export class SequenceScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.blue;

  constructor(game) {
    this.game = game;
    this.states = new Map();
    // 보호자 리포트용(메모리에만): 성공한 가장 긴 순서, 성공 횟수, 다시 알려 준 횟수
    this.stats = { bestLength: 0, rounds: 0, wrong: 0, hints: 0 };
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.slotR = Math.min(unit * 0.065, z.w * 0.05);
    this.slotY = this.game.h * 0.055 + unit * 0.035 + unit * 0.13;
    this.friendR = Math.min(z.w * 0.14, z.h * 0.3);
    this.friendX = z.x + unit * 0.15 + this.friendR * 1.05; // 왼쪽 가운데 집 버튼을 피해서
    this.friendY = z.y + z.h * 0.55;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.level = 1;
    this.round = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.states = new Map();
    this.legsSeenAt = -Infinity;
    this.seq = [];
    this.state = 'intro';
    this.showIdx = -1;
    this.demo = null; // 친구가 지금 보여 주는 부위
    this.demoT = 0;
    this.after(speak('친구가 만지는 곳을 잘 보고 기억해요!'), () => this.newRound());
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

  newRound() {
    const n = LENGTHS[this.level - 1];
    const legsOk = this.game.time - this.legsSeenAt < 3;
    const pool = PART_IDS.filter((id) => !PARTS[id].needsLegs || legsOk);
    this.seq = [];
    // 같은 부위가 연달아 나오지 않게(손을 떼지 않아도 다음 것으로 넘어가 버리지 않도록)
    while (this.seq.length < n) {
      const ok = pool.filter((p) => p !== this.seq[this.seq.length - 1]);
      const fresh = ok.filter((p) => !this.seq.includes(p));
      const id = pick(fresh.length ? fresh : ok);
      this.seq.push(id);
    }
    this.done = 0;
    this.revealed = new Set();
    this.lastPart = null;
    this.state = 'show';
    this.showStep(0);
  }

  // 친구가 하나씩 만지며 이름을 말한다.
  showStep(i) {
    if (i >= this.seq.length) {
      this.showIdx = -1;
      this.demo = null;
      this.after(speak('이제 똑같이 해 봐요!'), () => this.startPlay());
      return;
    }
    this.showIdx = i;
    this.demo = this.seq[i];
    this.demoT = 0;
    sfx.bloop();
    this.after(Promise.all([speak(`${PARTS[this.seq[i]].voice}!`), delay(SHOW_STEP * 1000)]), () => this.showStep(i + 1));
  }

  startPlay() {
    this.state = 'play';
    this.idle = 0;
    this.lastWrong = -Infinity;
    for (const s of this.states.values()) s.hold = {};
  }

  get expected() {
    return this.seq[this.done];
  }

  onTap() {
    if (this.state === 'play') this.stepDone(null);
  }

  update(dt, input) {
    const t = this.game.time;
    this.demoT += dt;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    if (input.people.some((p) => legsVisible(p.pose))) this.legsSeenAt = t;

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.level = 1;
        this.round = 0;
        this.newRound();
      }
      return;
    }

    // 아이마다 부위별로 손을 댄 시간을 잰다(인식이 잠깐 흔들려도 바로 0이 되지 않게 천천히 줄인다).
    const people = perPerson(this.states, input.people);
    for (const { pose, state: s, lost } of people) {
      s.hold ??= {};
      const touched = lost ? new Set() : touchedParts(pose);
      for (const id of PART_IDS) s.hold[id] = touched.has(id) ? (s.hold[id] ?? 0) + dt : Math.max(0, (s.hold[id] ?? 0) - dt * 2);
      s.touched = touched;
    }
    if (this.state !== 'play') return;

    this.idle += dt;
    const want = this.expected;
    const hit = people.find(({ state: s }) => s.hold[want] >= HOLD);
    if (hit) return this.stepDone(hit);

    // 방금 맞힌 부위에 손이 아직 남아 있는 것은 틀린 것이 아니다.
    const wrong = people.some(({ state: s }) => PART_IDS.some((id) => id !== want && id !== this.lastPart && s.hold[id] >= WRONG_HOLD));
    if (wrong && t - this.lastWrong > WRONG_GAP) {
      this.lastWrong = t;
      this.idle = 0;
      this.stats.wrong++;
      for (const { state: s } of people) s.hold = {};
      this.hint(true);
      return;
    }
    if (this.idle > IDLE_HINT) {
      this.idle = 0;
      this.hint(false);
    }
  }

  // 남은 순서를 다시 말해 주고, 친구가 다음 동작을 보여 준다(다음 칸 그림도 보여 줌).
  hint(wrong) {
    this.stats.hints++;
    this.revealed.add(this.done);
    this.demo = this.expected;
    this.demoT = 0;
    const rest = this.seq.slice(this.done).map((id) => PARTS[id].voice).join(', ');
    if (wrong) sfx.oops();
    this.after(speak(wrong ? `괜찮아요! 이번엔 ${rest}!` : `${rest}!`), () => {});
  }

  stepDone(person) {
    const id = this.expected;
    this.lastPart = id;
    this.idle = 0;
    this.demo = null;
    for (const s of this.states.values()) s.hold = {};
    const { particles, unit } = this.game;
    // 아이 몸의 그 부위에서 반짝
    const b = person && bodyPoints(person.pose);
    const at = b?.pts[id]?.[0] ?? { x: this.game.w / 2, y: this.game.h / 2 };
    particles.burst(at.x, at.y, { count: 22, colors: [COLORS.yellow, '#fff', COLORS.pink], speed: unit * 0.45, size: unit * 0.018, shape: 'star', gravity: 120 });
    const sx = this.slotX(this.done);
    particles.burst(sx, this.slotY, { count: 12, colors: [COLORS.yellow, '#fff'], speed: unit * 0.25, size: unit * 0.012, shape: 'star', gravity: 60 });
    sfx.sparkle();
    this.done++;
    if (this.done < this.seq.length) {
      sfx.bloop();
      return;
    }
    this.roundDone();
  }

  roundDone() {
    this.state = 'done';
    this.stats.rounds++;
    this.stats.bestLength = Math.max(this.stats.bestLength, this.seq.length);
    this.pulse[this.score] = 1;
    this.score++;
    this.round++;
    sfx.success();
    const { w, h, unit } = this.game;
    this.game.particles.burst(w / 2, h / 2, { count: 40, colors: RAINBOW, speed: unit * 0.8, size: unit * 0.02, shape: 'confetti' });
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 4;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('네 개까지 모두 기억했어요! 기억력 박사!'), () => {});
      return;
    }
    let line = pick(PRAISE);
    if (this.round >= ROUNDS) {
      this.round = 0;
      this.level++;
      line += ` 이번엔 ${COUNT[LENGTHS[this.level - 1]]} 개!`;
    }
    this.after(Promise.all([speak(line), delay(800)]), () => this.newRound());
  }

  slotX(i) {
    const gap = this.slotR * 2.7;
    return this.game.w / 2 + (i - (this.seq.length - 1) / 2) * gap;
  }

  draw(ctx) {
    const { unit, time } = this.game;
    // 왼쪽: 보여 주는 친구
    const fr = this.friendR;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(this.friendX, this.friendY, fr, 0, Math.PI * 2);
    ctx.fill();
    const k = this.demo ? ease(Math.min(1, this.demoT / 0.45)) : 0;
    drawFriend(ctx, this.friendX, this.friendY + fr * 0.12, fr * 0.3, this.demo, k, time);

    // 위쪽: 순서 칸. 보여 주는 동안은 그림, 따라 할 때는 ? (맞히면 그림이 나오고, 도움이 필요하면 미리 보여 줌)
    for (let i = 0; i < this.seq.length; i++) {
      const x = this.slotX(i);
      const y = this.slotY;
      const r = this.slotR;
      const current = (this.state === 'show' && i === this.showIdx) || (this.state === 'play' && i === this.done);
      const scale = current ? 1.18 + Math.sin(time * 6) * 0.05 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = current ? '#FFF3C4' : 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = r * 0.1;
      ctx.strokeStyle = i < this.done ? COLORS.green : current ? COLORS.orange : 'rgba(61,44,46,0.15)';
      ctx.stroke();
      const showPic = this.state === 'show' ? i <= this.showIdx : i < this.done || this.revealed?.has(i) || this.state !== 'play';
      if (showPic && this.state !== 'intro') partIcon(ctx, r, this.seq[i], time);
      else questionMark(ctx, r * 0.6, time);
      if (i < this.done) star(ctx, r * 0.68, -r * 0.68, r * 0.3, COLORS.yellow, '#F4A100');
      ctx.restore();
    }

    // 힌트를 보여 주는 중이면 아이 몸의 그 부위도 반짝여 준다.
    if (this.state === 'play' && this.revealed?.has(this.done)) {
      for (const p of this.game.people) {
        const b = bodyPoints(p.pose);
        if (!b) continue;
        for (const pt of b.pts[this.expected] ?? []) {
          ctx.strokeStyle = `rgba(255,210,63,${0.6 + Math.sin(time * 8) * 0.3})`;
          ctx.lineWidth = unit * 0.008;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, b.sh.sw * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }
}

// ---- 놀이 설명: 왼쪽 친구가 머리 → 어깨 → 배를 보여 주고, 오른쪽 아이가 똑같이 따라 한다 ----
const DEMO_SEQ = ['head', 'shoulder', 'belly'];

export const guide = {
  text: '친구가 만지는 곳을 잘 보고, 똑같은 순서로 만져요!',
  demo: (ctx, s, t) => {
    const period = 1.2;
    const total = DEMO_SEQ.length * 2 + 1;
    const step = Math.floor(t / period) % total;
    const local = (t % period) / period;
    const k = ease(Math.min(1, local / 0.4));
    const showing = step < DEMO_SEQ.length;
    const copying = step >= DEMO_SEQ.length && step < DEMO_SEQ.length * 2;
    const idx = showing ? step : copying ? step - DEMO_SEQ.length : -1;
    // 순서 칸
    DEMO_SEQ.forEach((id, i) => {
      const x = (i - 1) * s * 2.0;
      const y = -s * 3.1;
      const on = i === idx;
      ctx.fillStyle = on ? '#FFF3C4' : '#F4F4F4';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = s * 0.08;
      ctx.strokeStyle = on ? COLORS.orange : copying && i < idx ? COLORS.green : 'rgba(61,44,46,0.15)';
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      partIcon(ctx, s * 0.85, id, t);
      ctx.restore();
    });
    drawFriend(ctx, -s * 2.6, s * 1.25, s * 1.1, showing ? DEMO_SEQ[idx] : null, k, t, COLORS.orange);
    drawFriend(ctx, s * 2.6, s * 1.25, s * 1.1, copying ? DEMO_SEQ[idx] : null, k, t, COLORS.blue);
    if (copying && local > 0.5) star(ctx, s * 4.1, -s * 1.0, s * 0.45, COLORS.yellow, '#fff');
  },
};

// 메뉴 아이콘: 머리를 만지는 친구와 순서 칸 세 개
export function menuIcon(ctx, r, t) {
  const colors = [COLORS.yellow, COLORS.green, COLORS.pink];
  const on = Math.floor(t * 1.5) % 3;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc((i - 1) * r * 0.3, -r * 0.62, r * (i === on ? 0.12 : 0.09), 0, Math.PI * 2);
    ctx.fill();
  });
  drawFriend(ctx, 0, r * 0.3, r * 0.3, DEMO_SEQ[on], 1, t, COLORS.orange);
}
