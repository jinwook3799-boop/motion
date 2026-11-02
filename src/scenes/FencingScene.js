import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { cat } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { drawAvatar, P, perPerson, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';

// 단계: 1 = 과녁 찌르기, 2 = 고양이 칼 막기, 3 = 둘이 섞여서 더 빠르게
const LEVELS = [
  { goal: 8, kinds: ['thrust'], warn: 0 },
  { goal: 8, kinds: ['parry'], warn: 2.4 },
  { goal: 10, kinds: ['thrust', 'parry'], warn: 1.8 },
];
// ---- 칼·판정(어깨너비 sw 배, 실제 아이와 해 보며 조정할 추정값) ----
const SWORD_LEN = 1.5; // 손목에서 칼끝까지
const SWITCH_MORE = 0.4; // 다른 손이 이만큼 더 뻗어 있으면(잠시 유지) 칼을 그 손으로 옮긴다
const SWITCH_HOLD = 0.4;
const THRUST_REACH = [1.9, 2.7]; // 과녁: 몸 가운데에서 옆으로(칼끝이 닿는 곳)
const THRUST_HEIGHT = [-0.9, 0.6]; // 어깨선 기준 높이(음수 = 위)
const PARRY_REACH = [1.0, 1.8]; // 막을 자리: 칼날이 지나가면 막기
const PARRY_HEIGHT = [-1.0, 0.4];
const TARGET_R = 0.5; // 과녁·막을 자리 반지름
const TIP_SPEED = 1.2; // 칼끝이 이 빠르기(sw/초) 이상으로 움직이며 닿아야 '찌르기'(가만히 대고 있기는 아님)
const PARRY_ARM = 0.25; // 막을 자리가 나타나고 이 시간(초) 뒤부터 막기 인정(우연히 칼이 거기 있던 경우 방지)
const THRUST_HINT_AFTER = 7; // 과녁을 이만큼(초) 못 맞히면 안내
const REST = 0.8;
const HIT_VOICES = ['콕! 명중!', '찌르기 성공!', '멋진 찌르기!'];
const BLOCK_VOICES = ['챙! 막았다!', '챙! 잘 막았어요!', '막기 성공!'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const between = ([a, b]) => a + Math.random() * (b - a);

// 선분 (ax,ay)-(bx,by) 와 점 (px,py) 사이 거리
function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + dx * k - px, ay + dy * k - py);
}

// 펜싱 놀이: 아이 팔에 펜싱 칼이 생긴다(팔꿈치 → 손목 방향으로 쭉).
// 고양이 펜싱 선수가 내미는 과녁을 칼끝으로 콕! 찌르고, 고양이가 찌르려는 자리(주황 동그라미)는 칼날을 대서 챙! 막는다.
// 못 막아도 벌점 없이 "뿅!"(스펀지 칼). 두 명이면 둘 다 칼을 들고 함께 한다.
export class FencingScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColorOf = (person) => this.colorOf(person.id);

  constructor(game) {
    this.game = game;
    this.colors = new Map();
    this.people = [];
  }

  onResize() {
    this.S = this.game.unit * 0.055;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.t = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.states = new Map();
    this.colors = new Map();
    this.people = [];
    this.lastTargetId = null;
    this.lastSide = 0;
    this.resetLevel();
    this.state = 'intro';
    this.task = null;
    this.after(speak('펜싱 놀이! 팔을 쭉 뻗어 칼끝으로 과녁을 콕! 찔러요!'), () => this.rest(0.2));
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

  get cfg() {
    return LEVELS[this.level - 1];
  }

  resetLevel() {
    this.score = 0;
    this.pulse = new Array(Math.max(...LEVELS.map((l) => l.goal))).fill(0);
    this.thrustHinted = false;
  }

  colorOf(id) {
    if (!this.colors.has(id)) {
      const present = new Set(this.people.filter((p) => p.id !== id).map((p) => this.colors.get(p.id)));
      this.colors.set(id, PLAYER_COLORS.find((c) => !present.has(c)) ?? PLAYER_COLORS[0]);
    }
    return this.colors.get(id);
  }

  rest(time) {
    this.state = 'rest';
    this.stateT = time;
    this.task = null;
  }

  // 다음 할 일: 찌르기 과녁 또는 막을 자리. 두 명이면 번갈아 한 아이 곁에.
  newTask() {
    const people = this.people.filter((p) => !p.lost && shoulders(p.pose));
    let target = people[0] ?? null;
    if (people.length >= 2) target = people.find((p) => p.id !== this.lastTargetId) ?? people[0];
    if (target) this.lastTargetId = target.id;
    const kind = pick(this.cfg.kinds);
    const { zone: z, unit, homeButton: hb } = this.game;
    const sh = target ? shoulders(target.pose) : null;
    const mx = sh ? sh.mx : z.x + z.w / 2;
    const my = sh ? sh.my : z.y + z.h * 0.45;
    const sw = sh ? sh.sw : unit * 0.12;
    const r = clamp(sw * TARGET_R, unit * 0.04, unit * 0.09);
    let side = Math.random() < 0.5 ? -1 : 1;
    if (side === this.lastSide && Math.random() < 0.6) side = -side;
    this.lastSide = side;
    let x = mx + side * between(kind === 'thrust' ? THRUST_REACH : PARRY_REACH) * sw;
    if (x < z.x + r * 1.2 || x > z.x + z.w - r * 1.2) {
      x = mx - (x - mx);
      side = -side;
    }
    x = clamp(x, z.x + r * 1.2, z.x + z.w - r * 1.2);
    let y = clamp(my + between(kind === 'thrust' ? THRUST_HEIGHT : PARRY_HEIGHT) * sw, z.y + unit * 0.2 + r, z.y + z.h - r);
    if (hb && Math.hypot(x - hb.x, y - hb.y) < hb.r + r * 1.3) y = hb.y + hb.r + r * 1.3;
    // 고양이 선수는 과녁 쪽 화면 끝에 선다(왼쪽 위 집 버튼은 피해서).
    const cx = side > 0 ? z.x + z.w - this.S * 1.4 : z.x + this.S * 1.4;
    let cy = clamp(y + this.S * 0.4, z.y + this.S * 1.6, z.y + z.h - this.S * 2);
    if (side < 0 && hb) cy = Math.max(cy, hb.y + hb.r + this.S * 1.4);
    this.task = { kind, x, y, r, side, cx, cy, t: 0, warn: this.cfg.warn };
    this.state = 'task';
    this.taskT = 0;
    if (kind === 'parry') {
      sfx.peek();
      if (this.level === 3 && !this.parryIntroSaid) {
        this.parryIntroSaid = true;
        speak('주황 동그라미는 칼로 막아요!');
      }
    } else sfx.bloop();
  }

  onTap(x, y) {
    const k = this.task;
    if (this.state !== 'task' || !k) return;
    if (Math.hypot(x - k.x, y - k.y) < k.r * 1.6) (k.kind === 'thrust' ? this.hit() : this.block());
  }

  // ---------------- 진행 ----------------

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < this.pulse.length; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.people = input.people;
    for (const p of this.people) this.colorOf(p.id);
    this.updateSwords(dt);

    switch (this.state) {
      case 'rest':
        this.stateT -= dt;
        if (this.stateT <= 0) this.newTask();
        break;
      case 'task':
        this.updateTask(dt);
        break;
      case 'done':
        // 찌르기·막기 결과를 잠깐 보여 준다.
        this.stateT -= dt;
        if (this.stateT <= 0) {
          if (this.score >= this.cfg.goal) this.celebrate();
          else this.rest(REST);
        }
        break;
      case 'celebrate':
        this.stateT -= dt;
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = 0.35;
          firework(this.game);
        }
        if (this.stateT <= 0) this.nextLevel();
        break;
    }
  }

  // 아이마다 칼 하나: 더 뻗은 손에(잠깐 유지해야 바꿈), 팔꿈치 → 손목 방향으로.
  updateSwords(dt) {
    const now = this.game.time;
    for (const p of perPerson(this.states, this.people)) {
      const s = p.state;
      if (p.lost) continue;
      const pose = p.pose;
      const sh = shoulders(pose);
      if (!sh) {
        s.sword = null;
        continue;
      }
      const ext = (side) => {
        const w = pose[side === 'l' ? P.lWrist : P.rWrist];
        const shp = side === 'l' ? sh.ls : sh.rs;
        return visible(w, 0.3) ? Math.hypot(w.x - shp.x, w.y - shp.y) / sh.sw : -1;
      };
      s.hand ??= ext('r') >= ext('l') ? 'r' : 'l';
      const other = s.hand === 'l' ? 'r' : 'l';
      if (ext(other) > ext(s.hand) + SWITCH_MORE) {
        s.switchT = (s.switchT ?? 0) + dt;
        if (s.switchT > SWITCH_HOLD || ext(s.hand) < 0) {
          s.hand = other;
          s.switchT = 0;
          s.dir = null;
        }
      } else s.switchT = 0;
      const w = pose[s.hand === 'l' ? P.lWrist : P.rWrist];
      if (!visible(w, 0.3)) {
        s.sword = null;
        continue;
      }
      const e = pose[s.hand === 'l' ? P.lElbow : P.rElbow];
      const from = visible(e, 0.3) ? e : s.hand === 'l' ? sh.ls : sh.rs;
      let dx = w.x - from.x;
      let dy = w.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // 방향은 살짝 부드럽게(인식 떨림에 칼이 덜덜 떨지 않게)
      if (s.dir) {
        const k = Math.min(1, dt * 18);
        dx = lerp(s.dir.x, dx, k);
        dy = lerp(s.dir.y, dy, k);
        const n = Math.hypot(dx, dy) || 1;
        dx /= n;
        dy /= n;
      }
      s.dir = { x: dx, y: dy };
      const len = SWORD_LEN * sh.sw;
      const tip = { x: w.x + dx * len, y: w.y + dy * len };
      const prev = s.sword?.tip;
      const dtp = now - (s.sword?.t ?? now);
      const speed = prev && dtp > 0 ? Math.hypot(tip.x - prev.x, tip.y - prev.y) / dtp / sh.sw : 0;
      s.sword = { base: { x: w.x, y: w.y }, tip, prevTip: prev ?? tip, speed: lerp(s.sword?.speed ?? 0, speed, 0.5), t: now, sw: sh.sw, color: this.colorOf(p.id) };
    }
  }

  get swords() {
    const out = [];
    for (const [id, s] of this.states) if (s.sword && this.people.some((p) => p.id === id && !p.lost)) out.push(s.sword);
    return out;
  }

  updateTask(dt) {
    const k = this.task;
    k.t += dt;
    if (k.kind === 'thrust') {
      for (const sw of this.swords) {
        // 칼끝이 지나간 길이 과녁에 닿고, 칼끝이 움직이고 있으면 찌르기
        const d = segDist(sw.prevTip.x, sw.prevTip.y, sw.tip.x, sw.tip.y, k.x, k.y);
        if (d < k.r && sw.speed >= TIP_SPEED) return this.hit();
      }
      if (k.t > THRUST_HINT_AFTER && !this.thrustHinted) {
        this.thrustHinted = true;
        speak('팔을 쭉 뻗어서 칼끝으로 과녁을 콕!');
      }
    } else {
      if (k.t >= PARRY_ARM) {
        for (const sw of this.swords) {
          const d = segDist(sw.base.x, sw.base.y, sw.tip.x, sw.tip.y, k.x, k.y);
          if (d < k.r) return this.block();
        }
      }
      if (k.t >= k.warn) this.boop();
    }
  }

  hit() {
    const k = this.task;
    const { particles, unit } = this.game;
    sfx.pop();
    sfx.success();
    particles.burst(k.x, k.y, { count: 26, colors: RAINBOW, speed: unit * 0.5, size: unit * 0.016, shape: 'star', gravity: 200 });
    particles.ring(k.x, k.y, { color: '#fff', size: k.r * 1.4 });
    speak(pick(HIT_VOICES));
    this.thrustHinted = false;
    this.point('hit');
  }

  block() {
    const k = this.task;
    const { particles, unit } = this.game;
    sfx.clang();
    particles.burst(k.x, k.y, { count: 18, colors: ['#fff', COLORS.yellow, '#FFE58A'], speed: unit * 0.55, size: unit * 0.012, gravity: 300, life: 0.5 });
    particles.ring(k.x, k.y, { color: COLORS.yellow, size: k.r * 1.3 });
    speak(pick(BLOCK_VOICES));
    this.point('block');
  }

  point(result) {
    this.pulse[this.score] = 1;
    this.score++;
    this.task.result = result;
    this.task.doneT = this.t;
    this.state = 'done';
    this.stateT = 1.0;
  }

  // 못 막았을 때: 고양이 스펀지 칼이 '뿅'(벌점 없음)
  boop() {
    const k = this.task;
    sfx.boing();
    speak(Math.random() < 0.5 ? '뿅! 다음엔 칼로 막아요!' : '뿅! 괜찮아요, 다시!');
    k.result = 'boop';
    k.doneT = this.t;
    this.state = 'done';
    this.stateT = 1.1;
  }

  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    this.task = null;
    sfx.fanfare();
    speak(
      last
        ? '찌르기도 막기도 최고! 펜싱 챔피언이에요!'
        : this.level === 1
          ? '찌르기 대장! 2단계! 이번엔 고양이가 찌르려는 주황 동그라미를 칼로 챙! 막아요!'
          : '막기 대장! 3단계! 찌르기와 막기를 같이 해요!',
    );
  }

  nextLevel() {
    this.level = this.level >= LEVELS.length ? 1 : this.level + 1;
    this.levelPulse = 1;
    this.parryIntroSaid = false;
    this.resetLevel();
    this.rest(0.6);
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    this.drawPiste(ctx);
    for (const p of this.people) drawAvatar(ctx, p.pose, this.colorOf(p.id));
    const k = this.task;
    if (k) {
      this.drawFencer(ctx, k);
      if (k.kind === 'thrust') this.drawTarget(ctx, k);
      else this.drawParrySpot(ctx, k);
    }
    for (const sw of this.swords) sword(ctx, sw.base, sw.tip, sw.sw, sw.color);
    starGauge(ctx, this.game, this.cfg.goal, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  // 아래쪽 펜싱 경기장(길쭉한 은색 바닥)
  drawPiste(ctx) {
    const { zone: z, unit } = this.game;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    const top = z.y + z.h * 0.82;
    ctx.fillStyle = 'rgba(200,210,225,0.55)';
    ctx.fillRect(z.x, top, z.w, z.y + z.h - top);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = unit * 0.005;
    ctx.beginPath();
    ctx.moveTo(z.x, top);
    ctx.lineTo(z.x + z.w, top);
    for (const f of [0.5, 0.3, 0.7]) {
      ctx.moveTo(z.x + z.w * f, top);
      ctx.lineTo(z.x + z.w * f, z.y + z.h);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 고양이 펜싱 선수: 하얀 옷, 마스크를 머리 위로 올려 쓴 얼굴. 찌르기 땐 과녁 막대를, 막기 땐 칼을 아이 쪽으로 내민다.
  drawFencer(ctx, k) {
    const S = this.S;
    const { cx, cy, side } = k;
    const face = -side; // 아이 쪽(화면 가운데)을 본다
    const hop = Math.abs(Math.sin(this.t * 3)) * S * 0.06;
    ctx.save();
    ctx.translate(0, -hop);
    // 몸(하얀 펜싱복)
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#D5DCE6';
    ctx.lineWidth = S * 0.06;
    ctx.beginPath();
    ctx.ellipse(cx, cy + S * 1.0, S * 0.7, S * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.red;
    ctx.beginPath();
    ctx.ellipse(cx + face * S * 0.25, cy + S * 0.85, S * 0.12, S * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 팔 끝(손) 위치
    const shX = cx + face * S * 0.45;
    const shY = cy + S * 0.7;
    let hx;
    let hy;
    if (k.kind === 'thrust') {
      // 과녁 막대를 들고 과녁을 아이 앞에 내민다.
      hx = shX + face * S * 0.6;
      hy = shY;
      ctx.strokeStyle = '#B9803E';
      ctx.lineWidth = S * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(k.x, k.y);
      ctx.stroke();
    } else {
      // 칼을 막을 자리 쪽으로. 시간이 다 되면 쭉 찌른다(스펀지 칼끝).
      const doneK = k.result ? Math.min(1, (this.t - k.doneT) / 0.15) : 0;
      const lunge = k.result === 'boop' ? doneK : 0;
      hx = shX + face * S * 0.6;
      hy = shY;
      const dirx = k.x - hx;
      const diry = k.y - hy;
      const dist = Math.hypot(dirx, diry) || 1;
      const reach = lerp(Math.max(S * 1.2, dist - k.r * 2.2), dist, lunge);
      const tip = { x: hx + (dirx / dist) * reach, y: hy + (diry / dist) * reach };
      sword(ctx, { x: hx, y: hy }, tip, S * 0.9, COLORS.purple, true);
      if (k.result === 'boop') {
        ctx.fillStyle = COLORS.yellow;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, S * 0.25 * (1 + doneK * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = S * 0.26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = '#E9EEF5';
    ctx.beginPath();
    ctx.arc(hx, hy, S * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // 얼굴 + 머리 위로 올린 철망 마스크
    cat(ctx, cx, cy, S * 0.62);
    ctx.fillStyle = 'rgba(70,75,90,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - S * 0.62, S * 0.48, S * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,205,215,0.8)';
    ctx.lineWidth = S * 0.03;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * S * 0.15, cy - S * 0.78);
      ctx.lineTo(cx + i * S * 0.15, cy - S * 0.46);
      ctx.stroke();
    }
    // 막기 성공: 고양이가 놀라 별이 빙글
    if (k.result === 'block' || k.result === 'hit') {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 4 + (i * Math.PI * 2) / 3;
        star(ctx, cx + Math.cos(a) * S * 0.6, cy - S * 1.0 + Math.sin(a) * S * 0.2, S * 0.14, COLORS.yellow);
      }
    }
    ctx.restore();
  }

  // 찌를 과녁: 빨강·하양 동심원, 맞으면 쏙 들어간다.
  drawTarget(ctx, k) {
    const hitK = k.result === 'hit' ? Math.min(1, (this.t - k.doneT) / 0.25) : 0;
    const r = k.r * (1 + Math.sin(this.t * 5) * 0.04) * (1 - hitK * 0.3);
    ctx.save();
    const rings = [COLORS.red, '#fff', COLORS.red, '#fff', COLORS.yellow];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(k.x, k.y, r * (1 - i * 0.19), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = 'rgba(61,44,46,0.4)';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(k.x, k.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (hitK > 0) star(ctx, k.x, k.y, r * 0.5 * (1 + hitK), COLORS.yellow, '#fff');
    ctx.restore();
  }

  // 막을 자리: 주황 점선 동그라미 + 남은 시간만큼 줄어드는 고리, 가운데 '!'
  drawParrySpot(ctx, k) {
    if (k.result === 'block') {
      const a = Math.min(1, (this.t - k.doneT) / 0.4);
      ctx.save();
      ctx.globalAlpha = 1 - a;
      star(ctx, k.x, k.y, k.r * (0.8 + a), COLORS.yellow, '#fff');
      ctx.restore();
      return;
    }
    if (k.result) return;
    const left = clamp(1 - k.t / k.warn, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.15 * Math.abs(Math.sin(this.t * 6));
    ctx.fillStyle = COLORS.orange;
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = COLORS.orange;
    ctx.lineWidth = k.r * 0.14;
    ctx.setLineDash([k.r * 0.3, k.r * 0.2]);
    ctx.lineDashOffset = -this.t * k.r * 2;
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r * (1 + left * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.round(k.r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', k.x, k.y + k.r * 0.05);
    ctx.restore();
  }
}

// 펜싱 칼: 손 쪽 둥근 손잡이 보호대 + 가는 은색 칼날 + 둥근 칼끝(안전). sponge = 고양이의 스펀지 칼
export function sword(ctx, base, tip, sw, color = COLORS.blue, sponge = false) {
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const len = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(a);
  ctx.lineCap = 'round';
  // 칼날
  ctx.strokeStyle = sponge ? '#F7B2D9' : '#C9D3DF';
  ctx.lineWidth = Math.max(2, sw * (sponge ? 0.1 : 0.055));
  ctx.beginPath();
  ctx.moveTo(sw * 0.05, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1, sw * 0.018);
  ctx.beginPath();
  ctx.moveTo(sw * 0.2, -sw * 0.012);
  ctx.lineTo(len * 0.95, -sw * 0.012);
  ctx.stroke();
  // 칼끝 단추
  ctx.fillStyle = sponge ? COLORS.pink : '#8C99AA';
  ctx.beginPath();
  ctx.arc(len, 0, sw * (sponge ? 0.09 : 0.055), 0, Math.PI * 2);
  ctx.fill();
  // 보호대(종 모양 컵)
  ctx.fillStyle = '#E3E8EF';
  ctx.strokeStyle = '#8C99AA';
  ctx.lineWidth = sw * 0.03;
  ctx.beginPath();
  ctx.ellipse(sw * 0.08, 0, sw * 0.07, sw * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 손잡이(아이 색)
  ctx.strokeStyle = color;
  ctx.lineWidth = sw * 0.1;
  ctx.beginPath();
  ctx.moveTo(-sw * 0.22, 0);
  ctx.lineTo(sw * 0.02, 0);
  ctx.stroke();
  ctx.restore();
}

// 놀이 설명: 친구가 팔을 쭉 뻗어 과녁을 콕! 그다음 주황 동그라미에 칼을 대서 챙!
export const guide = {
  text: '팔을 쭉 뻗어 칼끝으로 과녁을 콕! 고양이가 찌르려는 주황 동그라미는 칼로 챙! 막아요.',
  demo: (ctx, s, t) => {
    const period = 5;
    const p = t % period;
    const first = p < 2.5;
    const q = first ? p : p - 2.5;
    const kx = -s * 1.6;
    const ky = s * 0.9;
    // 오른쪽: 고양이 선수
    const cx = s * 3.2;
    const cy = -s * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 1.1, s * 0.75, s * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    cat(ctx, cx, cy, s * 0.65);
    const spot = first ? { x: s * 1.6, y: -s * 0.4 } : { x: s * 0.6, y: -s * 0.3 };
    if (first) {
      ctx.strokeStyle = '#B9803E';
      ctx.lineWidth = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.6, cy + s * 0.8);
      ctx.lineTo(spot.x, spot.y);
      ctx.stroke();
      const hit = q > 1.0 && q < 2.2;
      [COLORS.red, '#fff', COLORS.red, COLORS.yellow].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, s * 0.5 * (1 - i * 0.24) * (hit ? 0.85 : 1), 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (q < 1.0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COLORS.orange;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (!first) sword(ctx, { x: cx - s * 0.6, y: cy + s * 0.8 }, { x: lerp(cx - s * 1.4, spot.x + s * 0.35, Math.min(1, q / 1.0)), y: lerp(cy + s * 0.6, spot.y, Math.min(1, q / 1.0)) }, s, COLORS.purple, true);
    // 친구: 첫 번째는 팔을 쭉 뻗어 찌르기, 두 번째는 칼을 세워 막기
    const ext = clamp((q - 0.5) / 0.5, 0, 1);
    let hand;
    let tip;
    if (first) {
      hand = [lerp(0.6, 1.5, ext), lerp(0.1, -1.2, ext)];
      const hx = kx + hand[0] * s;
      const hy = ky + hand[1] * s;
      const len = Math.hypot(spot.x - hx, spot.y - hy);
      const dirx = (spot.x - hx) / len;
      const diry = (spot.y - hy) / len;
      tip = { x: hx + dirx * lerp(s * 0.9, len, ext), y: hy + diry * lerp(s * 0.9, len, ext) };
    } else {
      hand = [lerp(0.6, 1.3, ext), lerp(0.1, -0.5, ext)];
      const hx = kx + hand[0] * s;
      const hy = ky + hand[1] * s;
      tip = { x: hx + s * 0.4, y: hy - s * 1.4 };
    }
    kid(ctx, kx, ky, s, { hands: [[-0.7, 0.3], hand], front: true, color: COLORS.blue });
    sword(ctx, { x: kx + hand[0] * s, y: ky + hand[1] * s }, tip, s, COLORS.blue);
    if (q > 1.0 && q < 2.2) {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + p * 3;
        star(ctx, spot.x + Math.cos(a) * s * 0.7, spot.y + Math.sin(a) * s * 0.7, s * 0.15, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// 메뉴 아이콘: 칼끝이 과녁에 콕
export function menuIcon(ctx, r, t = 0) {
  const k = (Math.sin(t * 3) + 1) / 2;
  const tx = r * 0.4;
  const ty = -r * 0.25;
  [COLORS.red, '#fff', COLORS.red, COLORS.yellow].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.36 * (1 - i * 0.24), 0, Math.PI * 2);
    ctx.fill();
  });
  const base = { x: -r * 0.55, y: r * 0.45 };
  const len = Math.hypot(tx - base.x, ty - base.y);
  const reach = lerp(len * 0.6, len, k);
  sword(ctx, base, { x: base.x + ((tx - base.x) / len) * reach, y: base.y + ((ty - base.y) / len) * reach }, r * 0.7, COLORS.blue);
}
