import { COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { campfire, waterGun } from '../engine/scenery.js';
import { P, shoulders, visible } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 10; // 꺼야 할 불 수
const MAX_FIRES = 3; // 동시에 타는 불 수
const FIRE_HP = 8; // 불 하나를 끄는 데 필요한 물방울 수
const ASSIST = 0.28; // 조준 보정: 불과 이 각도(라디안, 약 15°) 안으로 겨누면 물이 불 쪽으로 간다
const HIT = 1.5; // 불 크기 대비 맞는 범위(넉넉하게)
const REGROW_AFTER = 1.2; // 이 시간(초) 동안 물을 안 맞으면 불이 다시 조금씩 커진다
const SHOT_EVERY = 0.07; // 물방울 간격(초)
const DROP_SPEED = 1.5; // 물방울 속도(화면 짧은 변 배/초)
const DROP_LIFE = 1.1; // 물방울이 날아가는 시간(초)
const STRAIGHT = 0.8; // 팔이 이만큼 펴지면(어깨→손목 거리 / 팔 길이) 물총을 쏜다
const MAX_DOWN = 0.6; // 아래로 너무 향한 팔(차렷 자세)은 쏘지 않는다(방향의 y 성분 기준)
const HINT_AFTER = 8; // 이 시간(초) 동안 아무도 안 쏘면 방법을 다시 알려 준다
const WATER_COLORS = ['#4CC9F0', '#F49CC8']; // 아이별 물 색(파랑, 분홍)

// 팔이 쭉 펴져 있으면 { from: 총 위치, dir: 쏘는 방향 } (펴지지 않았거나 아래를 향하면 null)
function aim(pose, side) {
  const [s, e, w] = side === 'l' ? [P.lShoulder, P.lElbow, P.lWrist] : [P.rShoulder, P.rElbow, P.rWrist];
  const S = pose[s];
  const E = pose[e];
  const W = pose[w];
  const sh = shoulders(pose);
  if (!sh || !visible(S, 0.35) || !visible(W, 0.35)) return null;
  const reach = Math.hypot(W.x - S.x, W.y - S.y);
  if (reach < sh.sw * 0.7) return null;
  if (visible(E, 0.35)) {
    const arm = Math.hypot(E.x - S.x, E.y - S.y) + Math.hypot(W.x - E.x, W.y - E.y);
    if (reach / arm < STRAIGHT) return null;
  }
  const dir = { x: (W.x - S.x) / reach, y: (W.y - S.y) / reach };
  if (dir.y > MAX_DOWN) return null;
  return { from: W, dir, size: sh.sw * 0.45 };
}

// 물총 소방관: 팔을 쭉 뻗어 겨누면 손에서 물총이 나가고, 둘이 함께 모닥불을 끈다.
export class WaterScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  avatarColorOf(person) {
    return PLAYER_COLORS[this.rank(person.id)];
  }

  // 아이 id 순서대로 0, 1 (물 색과 아바타 색을 맞추기 위해)
  rank(id) {
    return Math.max(0, this.ids.indexOf(id)) % 2;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.fires = [];
    this.drops = [];
    this.guns = [];
    this.ids = [];
    this.shotT = new Map(); // 총 key → 다음 물방울까지 남은 시간
    this.sprayT = 0;
    this.spawnT = 0.3;
    this.idle = 0;
    this.tapAim = null;
    this.state = 'intro';
    this.after(speak('물총 발사 준비!'), () => (this.state = 'play'));
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

  // 보호자 터치: 화면 아래 가운데에서 터치한 곳으로 물을 쏜다.
  onTap(x, y) {
    this.tapAim = { x, y, t: 0.4 };
  }

  spawnFire() {
    const { zone: z, unit } = this.game;
    const r = unit * 0.07;
    for (let tries = 0; tries < 30; tries++) {
      const x = z.x + z.w * (0.12 + Math.random() * 0.76);
      const y = z.y + z.h * (0.22 + Math.random() * 0.38);
      if (this.fires.some((f) => Math.hypot(f.x - x, f.y - y) < unit * 0.25)) continue;
      this.fires.push({ x, y, r, hp: FIRE_HP, age: 0, hitT: 0, shooter: 0 });
      return;
    }
  }

  // 지금 물을 쏘고 있는 총들: 아이마다 펴진 팔 하나씩(양팔 모두 가능)
  readGuns(input) {
    const guns = [];
    for (const p of input.people) {
      if (p.lost) continue;
      for (const side of ['l', 'r']) {
        const a = aim(p.pose, side);
        if (a) guns.push({ key: `${p.id}${side}`, rank: this.rank(p.id), ...a });
      }
    }
    const { w, h, unit } = this.game;
    const mouse = input.pointers.find((p) => p.key === 'mouse');
    const target = this.tapAim ?? mouse;
    if (target) {
      const from = { x: w / 2, y: h * 0.92 };
      const len = Math.hypot(target.x - from.x, target.y - from.y) || 1;
      guns.push({ key: 'mouse', rank: 0, from, dir: { x: (target.x - from.x) / len, y: (target.y - from.y) / len }, size: unit * 0.04 });
    }
    return guns;
  }

  // 아이들은 팔로 정확히 겨누기 어려워서, 불 근처를 겨누면 가장 가까운 각도의 불 쪽으로 방향을 돌려 준다.
  assist(g) {
    const base = Math.atan2(g.dir.y, g.dir.x);
    let best = null;
    let bestDiff = ASSIST;
    for (const f of this.fires) {
      const a = Math.atan2(f.y - f.r * 0.2 - g.from.y, f.x - g.from.x);
      const diff = Math.abs(Math.atan2(Math.sin(a - base), Math.cos(a - base)));
      if (diff < bestDiff) {
        best = a;
        bestDiff = diff;
      }
    }
    if (best !== null) g.dir = { x: Math.cos(best), y: Math.sin(best) };
  }

  update(dt, input) {
    const { unit, zone: z, particles } = this.game;
    this.ids = input.people.map((p) => p.id);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    if (this.tapAim && (this.tapAim.t -= dt) <= 0) this.tapAim = null;

    this.guns = this.state === 'intro' ? [] : this.readGuns(input);
    // 쏘기
    for (const g of this.guns) {
      const left = (this.shotT.get(g.key) ?? 0) - dt;
      if (left > 0) {
        this.shotT.set(g.key, left);
        continue;
      }
      this.shotT.set(g.key, SHOT_EVERY);
      this.assist(g);
      const spread = (Math.random() - 0.5) * 0.08;
      const dx = g.dir.x * Math.cos(spread) - g.dir.y * Math.sin(spread);
      const dy = g.dir.x * Math.sin(spread) + g.dir.y * Math.cos(spread);
      const v = unit * DROP_SPEED;
      this.drops.push({ x: g.from.x + g.dir.x * g.size * 2.2, y: g.from.y + g.dir.y * g.size * 2.2, vx: dx * v, vy: dy * v, age: 0, rank: g.rank });
    }
    if (this.guns.length) {
      this.idle = 0;
      this.sprayT -= dt;
      if (this.sprayT <= 0) {
        this.sprayT = 0.15;
        sfx.spray();
      }
    }

    // 물방울 날아가기(살짝 떨어지는 포물선)와 불 맞히기
    for (const d of this.drops) {
      d.age += dt;
      d.vy += unit * 0.5 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      for (const f of this.fires) {
        if (f.hp <= 0 || Math.hypot(d.x - f.x, d.y - (f.y - f.r * 0.2)) > f.r * HIT) continue;
        d.age = DROP_LIFE;
        f.hp -= 1;
        f.hitT = 0;
        f.shooter = d.rank;
        if (Math.random() < 0.3) sfx.sizzle();
        particles.burst(d.x, d.y, { count: 2, colors: ['#ffffff', '#DDE6EE'], speed: unit * 0.12, size: unit * 0.012, gravity: -unit * 0.3, life: 0.6 });
        if (f.hp <= 0) this.douse(f);
        break;
      }
    }
    this.drops = this.drops.filter((d) => d.age < DROP_LIFE && d.y < z.y + z.h + unit * 0.1);

    // 불: 한동안 물을 안 맞으면 다시 커진다
    for (const f of this.fires) {
      f.age += dt;
      f.hitT += dt;
      if (f.hitT > REGROW_AFTER) f.hp = Math.min(FIRE_HP, f.hp + dt * 2);
    }
    this.fires = this.fires.filter((f) => f.hp > 0);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.state = 'play';
      }
      return;
    }
    if (this.state !== 'play') return;

    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.fires.length < MAX_FIRES) {
      this.spawnFire();
      this.spawnT = 1.2 + Math.random();
    }
    this.idle += dt;
    if (this.idle > HINT_AFTER) {
      this.idle = 0;
      this.after(speak('팔을 쭉 뻗어서 불을 겨눠 봐요!'), () => {});
    }
  }

  douse(f) {
    const { particles, unit } = this.game;
    sfx.douse();
    sfx.success();
    particles.burst(f.x, f.y - f.r * 0.3, { count: 18, colors: ['#ffffff', '#CFD8DC', '#B0BEC5'], speed: unit * 0.25, size: unit * 0.03, gravity: -unit * 0.4, life: 1.2 });
    particles.burst(f.x, f.y, { count: 20, colors: [WATER_COLORS[f.shooter], COLORS.yellow, '#fff'], speed: unit * 0.6, size: unit * 0.02, shape: 'star', gravity: 150 });
    if (this.state !== 'play') return;
    this.pulse[this.score] = 1;
    this.score++;
    this.spawnT = Math.min(this.spawnT, 0.8);
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 4;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('불을 모두 껐어요! 멋진 소방관들이에요!'), () => {});
    }
  }

  draw(ctx) {
    const { unit, time } = this.game;
    for (const f of this.fires) campfire(ctx, f.x, f.y, f.r, time + f.x, 0.35 + (0.65 * f.hp) / FIRE_HP);

    // 겨누는 방향을 점선으로 보여 준다(어디로 날아갈지 알 수 있게)
    ctx.save();
    ctx.lineCap = 'round';
    for (const g of this.guns) {
      ctx.strokeStyle = WATER_COLORS[g.rank];
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = unit * 0.008;
      ctx.setLineDash([unit * 0.015, unit * 0.025]);
      ctx.beginPath();
      ctx.moveTo(g.from.x + g.dir.x * g.size * 2.4, g.from.y + g.dir.y * g.size * 2.4);
      ctx.lineTo(g.from.x + g.dir.x * unit * 0.45, g.from.y + g.dir.y * unit * 0.45);
      ctx.stroke();
    }
    ctx.restore();

    for (const d of this.drops) {
      ctx.fillStyle = WATER_COLORS[d.rank];
      ctx.beginPath();
      ctx.arc(d.x, d.y, unit * 0.012 * (1 - d.age / DROP_LIFE / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const g of this.guns) {
      if (g.key !== 'mouse') waterGun(ctx, g.from.x, g.from.y, g.size * 1.6, Math.atan2(g.dir.y, g.dir.x), PLAYER_COLORS[g.rank]);
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }
}
