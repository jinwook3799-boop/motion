import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { levelSteps } from '../engine/icons.js';
import { duck } from '../engine/animals.js';
import { kid } from '../engine/scenery.js';
import { drawAvatar, P, perPerson, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework, leftToRight, PLAYER_COLORS } from './common.js';

// 단계마다 헤엄 방법이 바뀐다. strokes = 끝 벽까지 필요한 팔 젓기 수
const STYLES = [
  { key: 'free', strokes: 12, intro: '자유형! 팔을 번갈아 머리 위로 크게 돌려요!', hint: '한 팔씩 번갈아 머리 위로 쭉!' },
  { key: 'breast', strokes: 10, intro: '개구리 헤엄! 두 손을 가슴 앞에 모았다가 옆으로 쫙 벌려요!', hint: '두 손 모으고, 옆으로 쫙!' },
  { key: 'fly', strokes: 10, intro: '나비 헤엄! 두 팔을 같이 머리 위로 번쩍 올렸다가 내려요!', hint: '두 팔 같이 번쩍! 내리고!' },
];
// ---- 팔 젓기 판정(어깨너비 sw 배, 실제 아이와 해 보며 조정할 추정값) ----
const HEAD_UP = 0.75; // 코가 안 보일 때: 손목이 어깨선보다 이만큼 위면 '머리 위'
const DOWN_LINE = 0.1; // 손목이 어깨선보다 이만큼 아래로 내려오면 '내렸다'
const CLOSE = 1.0; // 개구리 헤엄: 두 손목 사이가 이보다 가까우면 '모았다'
const OPEN = 2.1; // 이보다 멀면 '벌렸다'
const GLIDE = 3; // 헤엄 위치가 목표를 따라가는 빠르기(1/초) — 한 번 저을 때마다 쭉 미끄러지는 느낌
const DUCK_TIME = 1.6; // 오리가 한 번 저을 거리를 가는 시간(초) — 아이는 보통 1초에 한 번쯤 젓는다
const DUCK_LEAD = 0.12; // 오리가 아이보다 이만큼(레인 비율) 앞서면 천천히 간다
const DUCK_CAP = 0.93; // 아이가 도착하기 전엔 오리가 이 이상 못 간다(아이가 1등)
const IDLE_HINT = 5; // 이만큼(초) 안 저으면 방법을 다시 알려 준다
const SPLASH_COLORS = ['#fff', '#BDE8FF', '#7FD1FF'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 수영 놀이: 팔을 저을 때마다 수영장 레인의 내 친구가 쭉쭉 헤엄친다. 혼자면 오리와 경주(아이가 이기게),
// 두 명이면 각자 자기 레인에서 함께 끝 벽까지. 3단계: 자유형 → 개구리 헤엄 → 나비 헤엄
export class SwimScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColorOf = (person) => this.colorOf(person.id);

  constructor(game) {
    this.game = game;
    this.colors = new Map();
    this.people = [];
  }

  onResize() {
    const { zone: z } = this.game;
    this.poolTop = z.y + z.h * 0.58;
    this.poolBot = z.y + z.h;
    this.startX = z.x + z.w * 0.1;
    this.endX = z.x + z.w * 0.88;
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
    this.startLevel(true);
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

  get style() {
    return STYLES[this.level - 1];
  }

  colorOf(id) {
    if (!this.colors.has(id)) {
      const present = new Set(this.people.filter((p) => p.id !== id).map((p) => this.colors.get(p.id)));
      this.colors.set(id, PLAYER_COLORS.find((c) => !present.has(c)) ?? PLAYER_COLORS[0]);
    }
    return this.colors.get(id);
  }

  // 레인 준비 → "준비, 하나, 둘, 셋, 출발!"
  startLevel(first = false) {
    this.state = 'ready';
    this.count = 0;
    this.swimmers = new Map(); // 아이 id(또는 'tap') → { pos, target, strokes, done, phase, splashT }
    this.duckPos = 0;
    this.duckTarget = 0;
    this.finishOrder = [];
    this.lastStroke = this.game.time;
    this.lastHint = this.game.time;
    for (const s of this.states.values()) Object.assign(s, { up: {}, closed: false, bothDown: true });
    const lead = first ? '수영장에 왔어요! ' : '';
    const go = () => {
      this.state = 'swim';
      this.count = 0;
      this.lastStroke = this.game.time;
      sfx.whistle();
      speak('출발!');
    };
    const tick = (n) => {
      if (n === 0) return go();
      this.count = n;
      sfx.select();
      this.after(Promise.all([speak(['', '하나', '둘', '셋'][n]), new Promise((r) => setTimeout(r, 900))]), () => tick(n - 1));
    };
    this.after(speak(lead + this.style.intro), () => tick(3));
  }

  swimmer(id) {
    if (!this.swimmers.has(id)) this.swimmers.set(id, { pos: 0, target: 0, strokes: 0, done: false, phase: 0, splashT: -9 });
    return this.swimmers.get(id);
  }

  // 레인에 보이는 헤엄 친구들: 지금 보이는 아이(왼쪽부터), 아무도 없으면 터치용 하나
  get lanes() {
    const people = leftToRight(this.people.filter((p) => !p.lost)).slice(0, 2);
    const ids = people.map((p) => p.id);
    if (!ids.length) ids.push('tap');
    const lanes = ids.map((id) => ({ id, color: id === 'tap' ? PLAYER_COLORS[0] : this.colorOf(id) }));
    if (lanes.length === 1) lanes.push({ id: 'duck' });
    return lanes;
  }

  onTap() {
    if (this.state !== 'swim') return;
    const id = this.people.find((p) => !p.lost)?.id ?? 'tap';
    this.stroke(id);
  }

  // ---------------- 진행 ----------------

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    this.people = input.people;
    for (const p of this.people) this.colorOf(p.id);

    const strokes = this.sense();
    if (this.state === 'swim') for (const id of strokes) this.stroke(id);

    for (const s of this.swimmers.values()) {
      s.pos += (s.target - s.pos) * Math.min(1, dt * GLIDE);
      if (s.target >= 1 && s.pos > 0.985) s.pos = 1;
    }

    if (this.state === 'swim') {
      this.updateDuck(dt);
      this.checkFinish();
      if (this.game.time - this.lastStroke > IDLE_HINT && this.game.time - this.lastHint > IDLE_HINT * 2) {
        this.lastHint = this.game.time;
        speak(this.style.hint);
      }
    } else if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.4;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.level = this.level >= STYLES.length ? 1 : this.level + 1;
        this.levelPulse = 1;
        this.startLevel();
      }
    }
    // 오리는 혼자 놀 때만, 아이가 도착한 뒤엔 마저 들어온다.
    this.duckPos += (this.duckTarget - this.duckPos) * Math.min(1, dt * GLIDE);
  }

  // 팔 젓기 찾기: 이번 단계 헤엄 방법대로 팔을 한 번 저을 때마다 그 아이 id 를 돌려준다.
  sense() {
    const out = [];
    for (const p of perPerson(this.states, this.people)) {
      const s = p.state;
      s.up ??= {};
      s.bothDown ??= true;
      if (p.lost || p.pose === s.lastPose) continue;
      s.lastPose = p.pose;
      const pose = p.pose;
      const sh = shoulders(pose);
      if (!sh) continue;
      const nose = pose[P.nose];
      const headY = visible(nose, 0.4) ? nose.y : sh.my - HEAD_UP * sh.sw;
      const downY = sh.my + DOWN_LINE * sh.sw;
      const lw = visible(pose[P.lWrist], 0.35) ? pose[P.lWrist] : null;
      const rw = visible(pose[P.rWrist], 0.35) ? pose[P.rWrist] : null;
      const key = this.style.key;
      if (key === 'free' || ((key === 'fly') && !(lw && rw))) {
        // 자유형(나비 헤엄인데 한 손만 보이면 그 손으로): 손이 머리 위로 올라갈 때마다 한 번
        for (const [side, w] of [['l', lw], ['r', rw]]) {
          if (!w) continue;
          if (!s.up[side] && w.y < headY) {
            s.up[side] = true;
            out.push(p.id);
          } else if (s.up[side] && w.y > downY) s.up[side] = false;
        }
      } else if (key === 'breast') {
        if (!lw || !rw) continue;
        const d = Math.hypot(lw.x - rw.x, lw.y - rw.y) / sh.sw;
        if (d < CLOSE) s.closed = true;
        else if (d > OPEN && s.closed) {
          s.closed = false;
          out.push(p.id);
        }
      } else if (key === 'fly') {
        const bothUp = lw.y < headY && rw.y < headY;
        if (bothUp && s.bothDown) {
          s.bothDown = false;
          out.push(p.id);
        } else if (lw.y > downY && rw.y > downY) s.bothDown = true;
      }
    }
    return out;
  }

  stroke(id) {
    const s = this.swimmer(id);
    if (s.done) return;
    s.strokes++;
    s.target = Math.min(1, s.strokes / this.style.strokes);
    s.phase++;
    s.splashT = this.t;
    this.lastStroke = this.game.time;
    sfx.splash();
    const { x, y } = this.laneSpot(id);
    const { particles, unit } = this.game;
    particles.burst(x + unit * 0.03, y, { count: 10, colors: SPLASH_COLORS, speed: unit * 0.3, size: unit * 0.012, gravity: 500, life: 0.6 });
  }

  // 오리: 아이가 한 번 저을 거리를 DUCK_TIME 초에 가고, 너무 앞서면 천천히. 아이가 먼저 도착하게.
  updateDuck(dt) {
    const lanes = this.lanes;
    if (!lanes.some((l) => l.id === 'duck')) return;
    const kidPos = Math.max(0, ...[...this.swimmers.values()].map((s) => s.target));
    const step = 1 / this.style.strokes / DUCK_TIME;
    const speed = this.duckTarget > kidPos + DUCK_LEAD ? step * 0.25 : step;
    const kidDone = [...this.swimmers.values()].some((s) => s.done);
    this.duckTarget = Math.min(kidDone ? 1 : DUCK_CAP, this.duckTarget + speed * dt);
  }

  checkFinish() {
    const lanes = this.lanes.filter((l) => l.id !== 'duck');
    for (const l of lanes) {
      const s = this.swimmers.get(l.id);
      if (!s || s.done || s.target < 1) continue;
      s.done = true;
      this.finishOrder.push(l.id);
      sfx.success();
      const { x, y } = this.laneSpot(l.id);
      const { particles, unit } = this.game;
      particles.burst(x, y, { count: 28, colors: RAINBOW, speed: unit * 0.5, size: unit * 0.016, shape: 'star', gravity: 200 });
      if (lanes.length > 1 && !lanes.every((q) => this.swimmers.get(q.id)?.done)) speak('도착! 친구도 힘내요!');
    }
    if (lanes.length && lanes.every((l) => this.swimmers.get(l.id)?.done)) this.celebrate(lanes.length > 1);
  }

  celebrate(together) {
    const last = this.level >= STYLES.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    this.duckTarget = 1;
    sfx.fanfare();
    const names = ['자유형', '개구리 헤엄', '나비 헤엄'];
    const head = together ? '둘 다 도착!' : '1등! 오리보다 빨라요!';
    speak(last ? `${head} 세 가지 헤엄 모두 성공! 수영 선수예요!` : `${head} ${names[this.level - 1]} 성공!`);
  }

  // 레인에서 헤엄 친구 머리 위치
  laneSpot(id) {
    const lanes = this.lanes;
    const i = Math.max(0, lanes.findIndex((l) => l.id === id));
    const lh = (this.poolBot - this.poolTop) / lanes.length;
    const pos = id === 'duck' ? this.duckPos : this.swimmers.get(id)?.pos ?? 0;
    return { x: this.startX + (this.endX - this.startX) * pos, y: this.poolTop + lh * (i + 0.55), lh };
  }

  // ---------------- 그리기 ----------------

  draw(ctx) {
    const { unit } = this.game;
    this.drawPool(ctx);
    for (const p of this.people) drawAvatar(ctx, p.pose, this.colorOf(p.id));
    for (const l of this.lanes) {
      const { x, y, lh } = this.laneSpot(l.id);
      const s = Math.min(lh * 0.32, unit * 0.06);
      if (l.id === 'duck') {
        const bob = Math.sin(this.t * 4) * s * 0.06;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(x - s * 0.9, y + s * 0.55, s * 0.9, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        duck(ctx, x, y + bob, s * 0.85);
      } else {
        const sw = this.swimmers.get(l.id);
        swimmer(ctx, x, y, s, l.color, this.t, this.style.key, sw ? this.t - sw.splashT : 9, sw?.phase ?? 0);
        if (sw?.done) {
          for (let i = 0; i < 3; i++) {
            const a = this.t * 2 + (i * Math.PI * 2) / 3;
            star(ctx, x + Math.cos(a) * s * 1.4, y - s * 0.4 + Math.sin(a) * s * 0.8, s * 0.22, COLORS.yellow, '#fff');
          }
        }
      }
    }
    this.drawHint(ctx);
    if (this.count > 0) this.drawCount(ctx);
    levelSteps(ctx, this.game, this.level, STYLES.length, this.levelPulse);
  }

  // 수영장: 물결, 레인 줄(빨강·하양 부표), 출발 벽(왼쪽)·도착 벽(오른쪽, 깃발)
  drawPool(ctx) {
    const { zone: z, unit } = this.game;
    const top = this.poolTop;
    const bot = this.poolBot;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();
    // 수영장 가장자리 타일
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(z.x, top - unit * 0.025, z.w, unit * 0.025);
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, 'rgba(90,200,250,0.55)');
    grad.addColorStop(1, 'rgba(40,150,230,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(z.x, top, z.w, bot - top);
    // 반짝이는 물결
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = unit * 0.004;
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const wx = z.x + ((i * 0.137 + this.t * 0.02 * (i % 2 ? 1 : -1)) % 1 + 1) % 1 * z.w;
      const wy = top + (bot - top) * (((i * 0.29) % 1) * 0.9 + 0.05);
      ctx.beginPath();
      ctx.arc(wx, wy, unit * 0.02, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    // 레인 줄
    const n = this.lanes.length;
    const lh = (bot - top) / n;
    for (let i = 1; i < n; i++) {
      const y = top + lh * i;
      const r = unit * 0.009;
      for (let x = z.x + r; x < z.x + z.w; x += r * 2.2) {
        ctx.fillStyle = Math.floor((x - z.x) / (r * 2.2)) % 6 < 3 ? COLORS.red : '#fff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 출발 벽·도착 벽
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(this.startX - unit * 0.045, top, unit * 0.015, bot - top);
    ctx.fillStyle = 'rgba(255,210,63,0.9)';
    ctx.fillRect(this.endX + unit * 0.03, top, unit * 0.02, bot - top);
    // 도착 깃발 줄
    const fy = top - unit * 0.07;
    ctx.strokeStyle = 'rgba(61,44,46,0.5)';
    ctx.lineWidth = unit * 0.003;
    ctx.beginPath();
    ctx.moveTo(this.endX - unit * 0.06, fy);
    ctx.lineTo(this.endX + unit * 0.1, fy);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const x = this.endX - unit * 0.05 + i * unit * 0.035;
      ctx.fillStyle = RAINBOW[i % RAINBOW.length];
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.lineTo(x + unit * 0.025, fy);
      ctx.lineTo(x + unit * 0.0125, fy + unit * 0.03 + Math.sin(this.t * 3 + i) * unit * 0.004);
      ctx.fill();
    }
    ctx.restore();
  }

  // 오른쪽 위: 이번 헤엄 방법을 움직여 보여 주는 친구(왼쪽 위는 집 버튼 자리)
  drawHint(ctx) {
    const { zone: z, unit } = this.game;
    const r = Math.min(z.w * 0.09, z.h * 0.15);
    const x = z.x + z.w - r * 1.2;
    const y = z.y + r * 1.25;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    kid(ctx, x, y + r * 0.12, r * 0.33, { hands: styleHands(this.style.key, this.t), color: COLORS.blue });
    ctx.restore();
    void unit;
  }

  drawCount(ctx) {
    const { w, h, unit } = this.game;
    const r = unit * 0.09;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.blue;
    ctx.font = `800 ${Math.round(r * 1.2)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.count), w / 2, h * 0.42 + r * 0.06);
    ctx.restore();
  }
}

// 헤엄 방법별 팔 모양(설명 친구·안내용). t = 시간(초)
function styleHands(key, t) {
  const k = (Math.sin(t * 4) + 1) / 2;
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  if (key === 'breast') return [mix([-0.15, -0.35], [-1.35, -0.35]), mix([0.15, -0.35], [1.35, -0.35])];
  if (key === 'fly') return [mix([-0.5, -1.9], [-0.75, 0.45]), mix([0.5, -1.9], [0.75, 0.45])];
  return [mix([-0.55, -1.9], [-0.75, 0.45]), mix([0.75, 0.45], [0.55, -1.9])];
}

// 헤엄치는 친구: 물 위로 수영모·물안경 쓴 얼굴과 팔이 보인다. since = 마지막으로 저은 뒤 시간
function swimmer(ctx, x, y, s, color, t, key, since = 9, phase = 0) {
  ctx.save();
  const bob = Math.sin(t * 3) * s * 0.05;
  // 물결 자국(저을 때 커진다)
  const wake = since < 0.6 ? 1 - since / 0.6 : 0;
  ctx.fillStyle = `rgba(255,255,255,${0.35 + wake * 0.4})`;
  ctx.beginPath();
  ctx.ellipse(x - s * 1.1, y + s * 0.45, s * (1.2 + wake * 0.6), s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // 몸(물속, 흐릿하게)
  ctx.fillStyle = 'rgba(255,214,165,0.55)';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.9, y + s * 0.4, s * 0.85, s * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // 팔: 저은 직후 크게 돌아가는 모습
  const swing = since < 0.5 ? since / 0.5 : 1;
  ctx.strokeStyle = '#FFD6A5';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.22;
  const arm = (a) => {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y + s * 0.2);
    ctx.lineTo(x - s * 0.2 + Math.cos(a) * s * 0.95, y + s * 0.2 + Math.sin(a) * s * 0.95);
    ctx.stroke();
  };
  if (key === 'breast') {
    const a = -0.3 + swing * 0.9;
    arm(-a);
    arm(a);
  } else if (key === 'fly') {
    arm(-Math.PI * 0.5 - (1 - swing) * 1.2 + swing * 1.4);
  } else {
    const a = -Math.PI * 0.5 + swing * Math.PI * 0.9;
    arm(phase % 2 ? a : a + Math.PI * 0.2);
  }
  // 머리: 수영모 + 물안경
  ctx.translate(0, bob);
  ctx.fillStyle = '#FFD6A5';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.05, s * 0.53, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.15, y - s * 0.38, s * 0.12, s * 0.05, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y + s * 0.02);
  ctx.lineTo(x + s * 0.5, y + s * 0.02);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#7FD1FF';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(x + side * s * 0.2, y + s * 0.03, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(x, y + s * 0.2, s * 0.14, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
}

// 놀이 설명: 친구가 팔을 번갈아 머리 위로 돌리면 수영장의 친구가 쭉쭉 헤엄쳐 오리보다 먼저 도착
export const guide = {
  text: '팔을 크게 저을 때마다 쭉쭉 헤엄쳐요. 오리보다 먼저 도착해요!',
  demo: (ctx, s, t) => {
    const period = 4;
    const p = t % period;
    kid(ctx, -s * 2.6, -s * 0.3, s * 0.9, { hands: styleHands('free', t * 0.8), color: COLORS.blue });
    // 수영장
    const top = s * 0.9;
    ctx.fillStyle = 'rgba(90,200,250,0.6)';
    ctx.fillRect(-s * 5, top, s * 10, s * 2.4);
    ctx.fillStyle = COLORS.red;
    for (let x = -s * 4.9; x < s * 5; x += s * 0.3) {
      ctx.beginPath();
      ctx.arc(x, top + s * 1.2, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,210,63,0.9)';
    ctx.fillRect(s * 4.2, top, s * 0.15, s * 2.4);
    const k = Math.min(1, p / 3.2);
    const steps = Math.floor(k * 8);
    const pos = (steps + Math.min(1, (k * 8 - steps) * 3)) / 8;
    swimmer(ctx, -s * 4 + s * 7.8 * pos, top + s * 0.65, s * 0.45, COLORS.blue, t, 'free', (k * 8 - steps) * 0.4, steps);
    duck(ctx, -s * 4 + s * 7.2 * k, top + s * 1.8, s * 0.38);
    if (p > 3.2) {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + p * 2;
        star(ctx, s * 3.8 + Math.cos(a) * s * 0.7, top + s * 0.6 + Math.sin(a) * s * 0.5, s * 0.16, i % 2 ? '#fff' : COLORS.yellow);
      }
    }
  },
};

// 메뉴 아이콘: 물결 위 수영모 친구
export function menuIcon(ctx, r, t = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(90,200,250,0.75)';
  ctx.fillRect(-r, r * 0.1, r * 2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  for (let x = -r; x <= r; x += r * 0.1) ctx.lineTo(x, r * 0.1 + Math.sin(x / r * 8 + t * 3) * r * 0.04);
  ctx.stroke();
  ctx.restore();
  swimmer(ctx, r * 0.15, r * 0.02, r * 0.4, COLORS.blue, t, 'free', (t * 0.8) % 1, Math.floor(t * 0.8));
  void clamp;
}
