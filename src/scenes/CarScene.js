import { COLORS } from '../engine/draw.js';
import { levelSteps, starGauge } from '../engine/icons.js';
import { car, cone, log, rock } from '../engine/scenery.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 10; // 한 단계에서 피할 장애물 수(별)
const LANES = 3;
// 단계별 난이도: fall = 장애물이 화면 위에서 차까지 내려오는 시간(초), gap = 다음 장애물까지(초),
// double = 두 차선을 함께 막을 확률(한 차선은 항상 비워 둔다)
const LEVELS = [
  { fall: 3.4, gap: [2.4, 3.0], double: 0 },
  { fall: 3.0, gap: [2.0, 2.6], double: 0.15 },
  { fall: 2.6, gap: [1.7, 2.2], double: 0.3 },
  { fall: 2.3, gap: [1.5, 1.9], double: 0.4 },
  { fall: 2.0, gap: [1.3, 1.7], double: 0.5 },
];
const TARGET_CAR = 0.7; // 이 확률로 장애물이 차가 있는 차선에 떨어진다(가만히 있으면 못 피하게)
// 몸이 화면 가운데에서 벗어난 만큼에 곱하는 배율. 아이가 한두 걸음만 옆으로 가도 끝 차선까지 닿게 한다.
const GAIN_ONE = 2.2;
const GAIN_TWO = 1.3;
const STEER = 9; // 차가 목표 위치를 따라가는 빠르기
const CAR_KEEP = 1.5; // 안 보이는 아이의 차를 남겨 두는 시간(초)
const HIT_VOICE_GAP = 5; // 부딪힘 안내 음성 최소 간격(초)
const KINDS = ['cone', 'rock', 'log'];
const FLOWER_COLORS = [COLORS.yellow, COLORS.pink, '#fff'];
const between = ([a, b]) => a + Math.random() * (b - a);

// 자동차 운전: 몸을 좌우로 움직여 아래쪽 자동차를 운전하고, 위에서 내려오는 장애물을 피한다.
// 아이가 두 명이면 각자 자기 자동차를 운전한다(색으로 구분).
export class CarScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColorOf = (person) => this.cars.get(person.id)?.color ?? PLAYER_COLORS[0];

  constructor(game) {
    this.game = game;
    this.cars = new Map();
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.roadW = Math.min(z.w * 0.62, z.h * 1.25);
    this.roadX = z.x + (z.w - this.roadW) / 2;
    this.laneW = this.roadW / LANES;
    this.carW = Math.min(this.laneW * 0.55, unit * 0.13);
    this.carY = z.y + z.h - this.carW * 1.2;
    this.obsS = Math.min(this.laneW * 0.3, unit * 0.075);
  }

  laneX(i) {
    return this.roadX + this.laneW * (i + 0.5);
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.scroll = 0;
    this.score = 0;
    this.level = 1;
    this.levelPulse = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.obstacles = [];
    this.cars = new Map();
    this.lastHitVoice = -Infinity;
    this.tapX = null;
    sfx.horn();
    this.after(speak('빵빵! 몸을 옆으로 움직여서 피해요. 출발!'), () => {
      this.state = 'drive';
      this.spawnT = 0.5;
    });
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

  // 보호자·PC 테스트용: 누른 곳으로 차를 옮긴다.
  onTap(x) {
    this.tapX = x;
  }

  update(dt, input) {
    this.t += dt;
    this.levelPulse = Math.max(0, this.levelPulse - dt * 1.5);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    this.steer(dt, input);

    const speed = (this.carY - this.game.zone.y) / this.cfg.fall; // 픽셀/초
    if (this.state !== 'intro') this.scroll += speed * dt;

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) this.nextLevel();
    } else if (this.state === 'drive') {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawn();
        this.spawnT = between(this.cfg.gap);
      }
    }

    for (const o of this.obstacles) {
      o.y += speed * dt;
      this.collide(o);
      if (!o.passed && o.y - this.obsS > this.carY + this.carW * 0.75) {
        o.passed = true;
        if (!o.hit) this.dodged(o);
      }
    }
    const bottom = this.game.zone.y + this.game.zone.h + this.obsS * 2;
    this.obstacles = this.obstacles.filter((o) => o.y < bottom);
  }

  // 아이마다 자기 차를 몸 위치로 운전한다. 아무도 안 보이면 차는 그 자리에서 기다린다.
  steer(dt, input) {
    const { w, time } = this.game;
    const people = input.people;
    const gain = people.length >= 2 ? GAIN_TWO : GAIN_ONE;
    const road = this.roadX + this.roadW / 2;
    const half = this.roadW / 2 - this.carW * 0.55;
    const clamp = (x) => Math.max(road - half, Math.min(road + half, x));

    const used = new Set([...this.cars.values()].filter((c) => people.some((p) => p.id === c.id)).map((c) => c.color));
    for (const p of people) {
      let c = this.cars.get(p.id);
      if (!c) {
        // 새로 들어온 아이: 남아 있는 '주인 없는' 차를 이어받거나 새 차를 만든다.
        const orphan = [...this.cars.values()].find((o) => !people.some((q) => q.id === o.id));
        const color = orphan?.color ?? PLAYER_COLORS.find((col) => !used.has(col)) ?? PLAYER_COLORS[0];
        if (orphan) this.cars.delete(orphan.id);
        c = { id: p.id, x: orphan?.x ?? road, tilt: 0, hitT: 0, color };
        used.add(color);
        this.cars.set(p.id, c);
      }
      c.target = clamp(road + (p.center.x - w / 2) * gain);
      c.seen = time;
    }
    for (const [id, c] of this.cars) if (time - c.seen > CAR_KEEP && this.cars.size > 1) this.cars.delete(id);
    if (!this.cars.size) this.cars.set('solo', { id: 'solo', x: road, target: road, tilt: 0, hitT: 0, color: PLAYER_COLORS[0], seen: time });

    // 터치·마우스는 첫 번째 차를 움직인다.
    const mouse = input.pointers.find((q) => q.key === 'mouse');
    const first = this.cars.values().next().value;
    if (mouse) this.tapX = mouse.x;
    if (this.tapX !== null && !people.length) first.target = clamp(this.tapX);

    for (const c of this.cars.values()) {
      const before = c.x;
      c.x += (c.target - c.x) * Math.min(1, dt * STEER);
      const v = (c.x - before) / Math.max(dt, 1e-3);
      c.tilt += (Math.max(-0.35, Math.min(0.35, v / (this.laneW * 6))) - c.tilt) * Math.min(1, dt * 10);
      c.hitT = Math.max(0, c.hitT - dt);
    }
  }

  // 장애물은 대부분 차가 있는 차선에 떨어뜨려 옆으로 움직이게 한다. 한 차선은 항상 비어 있다.
  spawn() {
    const cars = [...this.cars.values()];
    const carLanes = cars.map((c) => Math.max(0, Math.min(LANES - 1, Math.floor((c.x - this.roadX) / this.laneW))));
    const first =
      Math.random() < TARGET_CAR ? carLanes[Math.floor(Math.random() * carLanes.length)] : Math.floor(Math.random() * LANES);
    const lanes = [first];
    if (Math.random() < this.cfg.double) {
      const others = [0, 1, 2].filter((l) => l !== first);
      lanes.push(others[Math.floor(Math.random() * others.length)]);
    }
    const y = this.game.zone.y - this.obsS;
    for (const lane of lanes) {
      this.obstacles.push({ lane, x: this.laneX(lane), y, kind: KINDS[Math.floor(Math.random() * KINDS.length)], hit: false, passed: false });
    }
  }

  collide(o) {
    if (o.hit || o.passed) return;
    const halfW = o.kind === 'log' ? this.obsS * 1.1 : this.obsS * 0.6;
    for (const c of this.cars.values()) {
      // 유아용으로 판정을 조금 너그럽게(차와 장애물 크기보다 작게) 잡는다.
      if (Math.abs(o.y - this.carY) > this.carW * 0.6 + this.obsS * 0.4) continue;
      if (Math.abs(o.x - c.x) > (this.carW / 2 + halfW) * 0.8) continue;
      o.hit = true;
      c.hitT = 0.7;
      sfx.bonk();
      this.game.particles.burst(o.x, o.y, { count: 14, colors: ['#fff', COLORS.yellow, '#C9C2BC'], speed: this.game.unit * 0.4, size: this.game.unit * 0.015, gravity: 300 });
      // 부딪혀도 벌점은 없다. 어떻게 하는지만 다시 알려 준다.
      if (this.game.time - this.lastHitVoice > HIT_VOICE_GAP) {
        this.lastHitVoice = this.game.time;
        speak('쿵! 옆으로 움직여서 피해 봐요!');
      }
      return;
    }
  }

  dodged(o) {
    sfx.sparkle();
    const { particles, unit } = this.game;
    particles.burst(o.x, this.carY, { count: 12, colors: [COLORS.yellow, '#fff'], speed: unit * 0.35, size: unit * 0.016, shape: 'star', gravity: 150 });
    if (this.state !== 'drive') return;
    this.pulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) this.celebrate();
  }

  // 한 단계 성공: 축하하고 다음 단계로. 5단계까지 모두 하면 크게 축하하고 1단계부터 다시.
  celebrate() {
    const last = this.level >= LEVELS.length;
    this.state = 'celebrate';
    this.stateT = last ? 5 : 3.5;
    this.fireT = 0;
    sfx.fanfare();
    sfx.horn();
    speak(last ? '5단계까지 모두 성공! 최고의 운전사예요!' : `잘 피했어요! ${this.level + 1}단계! 조금 더 빨라져요!`);
  }

  nextLevel() {
    this.score = 0;
    this.levelPulse = 1;
    this.level = this.level >= LEVELS.length ? 1 : this.level + 1;
    this.state = 'drive';
    this.spawnT = 1;
  }

  draw(ctx) {
    const { zone: z, unit } = this.game;
    const { roadX, roadW, laneW } = this;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, unit * 0.04);
    ctx.clip();

    // 길가 풀밭과 지나가는 꽃
    ctx.fillStyle = 'rgba(155,216,138,0.85)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    const flowerGap = unit * 0.16;
    const off = this.scroll % flowerGap;
    for (let y = z.y - flowerGap + off, i = Math.floor(this.scroll / flowerGap); y < z.y + z.h + flowerGap; y += flowerGap, i--) {
      for (const side of [-1, 1]) {
        const edge = side < 0 ? roadX : roadX + roadW;
        const room = side < 0 ? roadX - z.x : z.x + z.w - edge;
        const k = ((((i * 37 + (side > 0 ? 11 : 0)) % 10) + 10) % 10) / 10;
        const x = edge + side * room * (0.25 + k * 0.5);
        ctx.fillStyle = FLOWER_COLORS[(((i + (side > 0 ? 1 : 0)) % 3) + 3) % 3];
        for (let p = 0; p < 5; p++) {
          const a = (p * Math.PI * 2) / 5;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * unit * 0.012, y + Math.sin(a) * unit * 0.012, unit * 0.01, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = COLORS.orange;
        ctx.beginPath();
        ctx.arc(x, y, unit * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 도로와 움직이는 차선
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(roadX, z.y, roadW, z.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(roadX, z.y, unit * 0.012, z.h);
    ctx.fillRect(roadX + roadW - unit * 0.012, z.y, unit * 0.012, z.h);
    const dash = unit * 0.09;
    ctx.fillStyle = COLORS.yellow;
    for (let l = 1; l < LANES; l++) {
      const x = roadX + laneW * l - unit * 0.006;
      for (let y = z.y - dash * 2 + (this.scroll % (dash * 2)); y < z.y + z.h; y += dash * 2) ctx.fillRect(x, y, unit * 0.012, dash);
    }
    ctx.restore();

    for (const o of this.obstacles) this.drawObstacle(ctx, o);

    // 장애물이 차 쪽으로 오면 피할 방향(비어 있는 쪽) 화살표
    if (this.state !== 'intro') for (const c of this.cars.values()) this.drawCue(ctx, c);

    for (const c of this.cars.values()) {
      const shake = c.hitT > 0 ? Math.sin(c.hitT * 40) * 0.15 : 0;
      car(ctx, c.x, this.carY, this.carW, c.color, c.tilt + shake);
    }

    if (this.state === 'intro') this.drawIntroHint(ctx);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
    levelSteps(ctx, this.game, this.level, LEVELS.length, this.levelPulse);
  }

  drawObstacle(ctx, o) {
    const s = this.obsS;
    ctx.save();
    if (o.hit) ctx.globalAlpha = 0.5;
    if (o.kind === 'cone') cone(ctx, o.x, o.y, s);
    else if (o.kind === 'rock') rock(ctx, o.x, o.y, s);
    else log(ctx, o.x, o.y, s * 0.75);
    ctx.restore();
  }

  // 같은 차선에 장애물이 다가오면 차 옆에 '이쪽으로!' 화살표를 깜빡인다.
  drawCue(ctx, c) {
    const lane = Math.max(0, Math.min(LANES - 1, Math.floor((c.x - this.roadX) / this.laneW)));
    const near = this.obstacles.filter((o) => !o.passed && !o.hit && o.y > this.carY - this.carW * 4.5 && o.y < this.carY);
    if (!near.some((o) => o.lane === lane)) return;
    const blocked = new Set(near.map((o) => o.lane));
    const free = [lane - 1, lane + 1].filter((l) => l >= 0 && l < LANES && !blocked.has(l));
    if (!free.length) return;
    // 비어 있는 쪽이 둘이면 길 가운데 쪽으로
    const to = free.length > 1 ? (c.x < this.roadX + this.roadW / 2 ? lane + 1 : lane - 1) : free[0];
    const dir = to > lane ? 1 : -1;
    const s = this.carW * 0.5;
    const x = c.x + dir * (this.carW * 0.95 + Math.abs(Math.sin(this.t * 8)) * s * 0.3);
    const y = this.carY;
    ctx.fillStyle = COLORS.green;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(x + dir * s * 0.6, y);
    ctx.lineTo(x - dir * s * 0.1, y - s * 0.55);
    ctx.lineTo(x - dir * s * 0.1, y - s * 0.22);
    ctx.lineTo(x - dir * s * 0.6, y - s * 0.22);
    ctx.lineTo(x - dir * s * 0.6, y + s * 0.22);
    ctx.lineTo(x - dir * s * 0.1, y + s * 0.22);
    ctx.lineTo(x - dir * s * 0.1, y + s * 0.55);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  // 시작 전: 장애물 세 가지 그림
  drawIntroHint(ctx) {
    const { w, zone: z } = this.game;
    const s = this.obsS * 1.2;
    const y = z.y + z.h * 0.4 + Math.sin(this.t * 3) * s * 0.1;
    cone(ctx, w / 2 - s * 2.8, y, s);
    rock(ctx, w / 2, y, s);
    log(ctx, w / 2 + s * 2.8, y, s * 0.75);
  }
}
