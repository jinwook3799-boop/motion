import { COLORS, RAINBOW } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { THINGS } from '../engine/things.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { josa, seededRandom, shuffle } from '../engine/util.js';

const ITEM_COUNT = 8; // 그림 속에 숨기는 물건 수
const FIND_COUNT = 3; // 한 그림에서 찾을 물건 수
const TARGETS = ['star', 'heart', 'apple', 'fish', 'balloon', 'duck', 'cat', 'frog', 'chick', 'rabbit', 'dog', 'drum'];
const SMOOTHING = 0.5;
const TRAIL_TIME = 4; // 동그라미 궤적을 기억하는 시간(초)
const HINT_AFTER = 25; // 이 시간(초) 동안 못 찾으면 정답 자리가 반짝인다
const MAX_LOOP = 0.5; // 동그라미가 그림 영역의 이 비율보다 크면 너무 크다고 본다

// 다각형 안에 점이 있는지(광선 투사법)
function inside(p, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// 숨은그림찾기: 찾은 물건 주위에 손으로 동그라미를 그리면 성공
export class HiddenScene {
  hideTrail = true;
  hideCursor = true;

  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.items = [];
  }

  onResize() {
    if (this.seed !== undefined) this.render();
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.trails = new Map(); // 펜 key → 동그라미 궤적(두 아이가 각자 그린다)
    this.pens = [];
    this.pulse = new Array(FIND_COUNT).fill(0);
    this.firstAsk = true;
    this.newPicture();
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

  newPicture() {
    this.seed = (Math.random() * 2 ** 32) >>> 0;
    const rnd = seededRandom(this.seed);
    this.theme = rnd() < 0.5 ? 'garden' : 'sea';
    // 물건 자리: 서로 겹치지 않게, 집 버튼(왼쪽 위)과 찾을 물건 표시(오른쪽 위)는 피한다.
    const spots = [];
    for (let tries = 0; spots.length < ITEM_COUNT && tries < 500; tries++) {
      const u = 0.07 + rnd() * 0.86;
      const v = 0.12 + rnd() * 0.8;
      if ((u < 0.16 && v < 0.3) || (u > 0.8 && v < 0.34)) continue;
      if (spots.some((s) => Math.hypot((s.u - u) * 1.6, s.v - v) < 0.2)) continue;
      spots.push({ u, v });
    }
    const ids = shuffle(TARGETS, rnd).slice(0, spots.length);
    this.items = ids.map((id, i) => ({ id, ...spots[i], size: 0.9 + rnd() * 0.25, rot: (rnd() - 0.5) * 0.8, found: false }));
    this.targets = shuffle(this.items, rnd).slice(0, FIND_COUNT);
    this.current = 0;
    this.found = 0;
    this.state = 'search';
    this.render();
    this.askTarget();
  }

  get target() {
    return this.targets[this.current];
  }

  askTarget() {
    this.searchT = 0;
    this.hinted = false;
    this.trails.clear();
    const name = josa(THINGS[this.target.id].name, '을', '를');
    const text = this.firstAsk ? `${name} 찾아보세요!` : `이번에는 ${name} 찾아보세요!`;
    this.firstAsk = false;
    this.after(speak(text), () => {});
  }

  itemPos(item) {
    const z = this.game.zone;
    return { x: z.x + item.u * z.w, y: z.y + item.v * z.h, s: this.game.unit * 0.05 * item.size };
  }

  // 배경과 숨은 물건을 한 장의 그림으로 미리 그려 둔다(매 프레임 다시 그리지 않게).
  render() {
    const { zone: z, unit, dpr } = this.game;
    this.canvas.width = Math.round(z.w * dpr);
    this.canvas.height = Math.round(z.h * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = seededRandom(this.seed ^ 0x9e3779b9);
    const s = unit * 0.05;
    if (this.theme === 'garden') drawGarden(ctx, z.w, z.h, s, rnd);
    else drawSea(ctx, z.w, z.h, s, rnd);

    for (const item of this.items) {
      const p = this.itemPos(item);
      ctx.save();
      ctx.translate(p.x - z.x, p.y - z.y);
      ctx.rotate(item.rot);
      THINGS[item.id].draw(ctx, 0, 0, p.s, 0);
      ctx.restore();
      // 가장자리를 살짝 가리는 잎·물풀로 '숨어 있는' 느낌을 준다.
      for (let k = 0; k < 2; k++) {
        const a = rnd() * Math.PI * 2;
        const lx = p.x - z.x + Math.cos(a) * p.s * 0.95;
        const ly = p.y - z.y + Math.sin(a) * p.s * 0.95;
        if (this.theme === 'garden') leaf(ctx, lx, ly, p.s * 0.45, a, pickLeaf(rnd));
        else bubble(ctx, lx, ly, p.s * 0.25);
      }
    }
  }

  // 손마다 펜 하나(손바닥 중심, 떨림 보정). 손 id 로 구분해 두 아이의 동그라미가 섞이지 않는다.
  readPens(input) {
    const raws = input.hands.filter((h) => !h.lost).map((h) => ({ key: `h${h.id}`, x: h.palm.x, y: h.palm.y }));
    const mouse = input.pointers.find((p) => p.key === 'mouse');
    if (mouse) raws.push({ key: 'mouse', x: mouse.x, y: mouse.y });
    const prev = new Map(this.pens.map((p) => [p.key, p]));
    return raws
      .filter((raw) => this.game.inZone(raw))
      .map((raw) => {
        const last = prev.get(raw.key);
        if (last && Math.hypot(raw.x - last.x, raw.y - last.y) < this.game.unit * 0.25) {
          return { key: raw.key, x: last.x + (raw.x - last.x) * SMOOTHING, y: last.y + (raw.y - last.y) * SMOOTHING };
        }
        return raw;
      });
  }

  update(dt, input) {
    const now = this.game.time;
    for (let i = 0; i < FIND_COUNT; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.pens = this.readPens(input);
    if (this.state !== 'search') return;

    this.searchT += dt;
    if (this.searchT > HINT_AFTER && !this.hinted) {
      this.hinted = true;
      this.after(speak('반짝이는 곳을 잘 봐요!'), () => {});
    }

    // 손을 잠깐 놓치는 건 괜찮지만, 오래 놓치면 그리던 동그라미를 지운다.
    for (const [key, trail] of this.trails) if (now - trail.at(-1).t > 0.6) this.trails.delete(key);

    for (const pen of this.pens) {
      let trail = this.trails.get(pen.key);
      if (!trail) this.trails.set(pen.key, (trail = []));
      const last = trail.at(-1);
      const step = last ? Math.hypot(pen.x - last.x, pen.y - last.y) : 0;
      if (last && step < 3) {
        last.t = now;
        continue;
      }
      trail.push({ x: pen.x, y: pen.y, t: now, len: (last?.len ?? 0) + step });
      while (trail.length > 1 && now - trail[0].t > TRAIL_TIME) trail.shift();
      if (this.checkLoop(trail)) return;
    }
  }

  // 궤적의 끝이 앞쪽 궤적과 다시 만나면(동그라미가 닫히면) 그 안을 검사한다.
  checkLoop(pts) {
    const unit = this.game.unit;
    const end = pts.at(-1);
    for (let j = 0; j < pts.length - 10; j++) {
      if (end.len - pts[j].len < unit * 0.45) break;
      if (Math.hypot(end.x - pts[j].x, end.y - pts[j].y) < unit * 0.07) {
        const poly = pts.slice(j);
        this.trails.clear();
        this.evaluate(poly);
        return true;
      }
    }
    return false;
  }

  evaluate(poly) {
    const z = this.game.zone;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const tooBig = Math.max(...xs) - Math.min(...xs) > z.w * MAX_LOOP || Math.max(...ys) - Math.min(...ys) > z.h * MAX_LOOP;
    const circled = this.items.filter((it) => !it.found && inside(this.itemPos(it), poly));
    this.lastLoop = { poly, t: this.game.time };

    if (circled.includes(this.target) && !tooBig) return this.success(poly);
    sfx.oops();
    if (tooBig && circled.length) this.after(speak('조금 더 작게 동그라미를 그려 볼까요?'), () => {});
    else if (circled.length) this.after(speak(`그건 ${josa(THINGS[circled[0].id].name, '이에요', '예요')}. 다시 찾아볼까요?`), () => {});
    else this.after(speak('다시 찾아볼까요?'), () => {});
  }

  success() {
    const item = this.target;
    item.found = true;
    this.pulse[this.found] = 1;
    this.found++;
    this.state = 'found';
    const { particles, unit } = this.game;
    const p = this.itemPos(item);
    sfx.success();
    particles.burst(p.x, p.y, { count: 36, colors: RAINBOW, speed: unit * 0.7, size: unit * 0.018, shape: 'confetti' });
    const name = THINGS[item.id].name;
    if (this.found >= FIND_COUNT) {
      const done = speak(`찾았다! ${name}!`).then(() => {
        sfx.fanfare();
        return speak('모두 찾았어요! 새 그림을 볼까요?');
      });
      this.after(done, () => this.newPicture());
      return;
    }
    this.after(speak(`찾았다! ${name}!`), () => {
      this.current++;
      this.state = 'search';
      this.askTarget();
    });
  }

  onTap() {}

  draw(ctx) {
    const { zone: z, unit, time } = this.game;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    ctx.drawImage(this.canvas, z.x, z.y, z.w, z.h);
    ctx.restore();

    // 찾은 물건에는 빨간 동그라미 표시
    for (const item of this.items) {
      if (!item.found) continue;
      const p = this.itemPos(item);
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = unit * 0.012;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.s * 1.6, p.s * 1.45, 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 오래 못 찾으면 정답 자리가 은은하게 반짝인다.
    if (this.state === 'search' && this.searchT > HINT_AFTER) {
      const p = this.itemPos(this.target);
      const k = (Math.sin(time * 4) + 1) / 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + k * 0.5})`;
      ctx.lineWidth = unit * 0.01;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * (1.5 + k * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 지금 그리는 동그라미 궤적
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const trail of this.trails.values()) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1];
        const b = trail[i];
        ctx.strokeStyle = `hsl(${(i * 8) % 360}, 95%, 55%)`;
        ctx.lineWidth = unit * 0.014;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    this.drawTargetPanel(ctx);
    for (const pen of this.pens) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = COLORS.purple;
      ctx.lineWidth = unit * 0.008;
      ctx.beginPath();
      ctx.arc(pen.x, pen.y, unit * 0.022, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    starGauge(ctx, this.game, FIND_COUNT, this.found, this.pulse);
  }

  // 오른쪽 위: 지금 찾을 물건
  drawTargetPanel(ctx) {
    if (!this.target) return;
    const { zone: z, unit, time } = this.game;
    const r = unit * 0.085;
    const x = z.x + z.w - r * 1.25;
    const y = z.y + r * 1.25;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.06, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = unit * 0.01;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    THINGS[this.target.id].draw(ctx, x, y + Math.sin(time * 3) * r * 0.04, r * 0.55, time);
  }
}

// ---- 배경 그림 ----

const LEAF_COLORS = ['#7BC86C', '#5DB65A', '#9BD88A', '#4FA84F'];
const FLOWER_COLORS = ['#FFB3C1', '#FFD6A5', '#CDB4DB', '#FFFFFF', '#BDE0FE', '#FFC8DD'];
const pickLeaf = (rnd) => LEAF_COLORS[Math.floor(rnd() * LEAF_COLORS.length)];

function leaf(ctx, x, y, s, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function flower(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFD23F';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function bubble(ctx, x, y, r) {
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGarden(ctx, w, h, s, rnd) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  sky.addColorStop(0, '#BDE7FF');
  sky.addColorStop(1, '#E8F7FF');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 4; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h * 0.15 + h * 0.04;
    for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.2, 0.75], [-0.9, 0.2, 0.7]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#A8E08F';
  ctx.fillRect(0, h * 0.24, w, h);
  ctx.fillStyle = '#93D57C';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(rnd() * w, h * (0.3 + rnd() * 0.6), w * (0.15 + rnd() * 0.15), h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const count = Math.round((w * h) / (s * s * 3.2));
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = h * 0.22 + rnd() * h * 0.8;
    const kind = rnd();
    if (kind < 0.4) leaf(ctx, x, y, s * (0.3 + rnd() * 0.4), rnd() * Math.PI, pickLeaf(rnd));
    else if (kind < 0.75) flower(ctx, x, y, s * (0.3 + rnd() * 0.35), FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)]);
    else {
      ctx.strokeStyle = pickLeaf(rnd);
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + k * s * 0.25, y - s * (0.4 + rnd() * 0.3));
        ctx.stroke();
      }
    }
  }
}

function drawSea(ctx, w, h, s, rnd) {
  const water = ctx.createLinearGradient(0, 0, 0, h);
  water.addColorStop(0, '#9BE1FA');
  water.addColorStop(1, '#3E9FD0');
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 5; i++) {
    const x = rnd() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w * 0.08, 0);
    ctx.lineTo(x + w * 0.2, h);
    ctx.lineTo(x + w * 0.1, h);
    ctx.fill();
  }
  ctx.fillStyle = '#F6DFA6';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.88);
  for (let x = 0; x <= w; x += w / 8) ctx.lineTo(x, h * (0.86 + rnd() * 0.04));
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  const count = Math.round((w * h) / (s * s * 4));
  const weeds = ['#3FA34D', '#2E8B57', '#6CC070'];
  const corals = ['#FF8FA3', '#FFB703', '#F15BB5'];
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const kind = rnd();
    if (kind < 0.35) {
      // 물풀
      const base = h * (0.88 + rnd() * 0.1);
      const len = s * (2 + rnd() * 4);
      ctx.strokeStyle = weeds[Math.floor(rnd() * weeds.length)];
      ctx.lineWidth = s * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, base);
      for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(k * 1.3 + i) * s * 0.35, base - (len * k) / 6);
      ctx.stroke();
    } else if (kind < 0.7) {
      bubble(ctx, x, rnd() * h * 0.85, s * (0.12 + rnd() * 0.3));
    } else if (kind < 0.85) {
      // 산호
      const base = h * (0.88 + rnd() * 0.08);
      ctx.strokeStyle = corals[Math.floor(rnd() * corals.length)];
      ctx.lineWidth = s * 0.2;
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.lineTo(x + k * s * 0.6, base - s * (1 + rnd()));
        ctx.stroke();
      }
    } else {
      // 돌
      ctx.fillStyle = rnd() < 0.5 ? '#B8B8C8' : '#9A9AAE';
      ctx.beginPath();
      ctx.ellipse(x, h * (0.9 + rnd() * 0.08), s * (0.5 + rnd() * 0.6), s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
