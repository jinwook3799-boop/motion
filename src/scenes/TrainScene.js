import { COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { train } from '../engine/scenery.js';
import { THINGS } from '../engine/things.js';
import { kneeUp, shoulders } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { josa, pick } from '../engine/util.js';
import { firework } from './common.js';

const GOAL = 5; // 태울 동물 수
const STEP_BOOST = 0.16; // 한 걸음마다 빨라지는 정도
const DECAY = 0.22; // 멈추면 초당 느려지는 정도
const MAX_TRAVEL = 0.6; // 최고 속도일 때 초당 이동 거리(놀이 영역 너비 배)
const STATION_EVERY = 3; // 역 사이 거리(놀이 영역 너비 배)
const BOB = 0.05; // 무릎이 안 보일 때: 어깨가 이만큼(어깨너비 배) 오르내리면 한 걸음
const PASSENGERS = ['rabbit', 'cat', 'dog', 'duck', 'frog', 'chick', 'penguin', 'lion', 'cow'];

// 칙칙폭폭 기차: 제자리에서 달리면 기차가 달리고, 역마다 동물 친구를 태운다.
export class TrainScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.orange;
  needsMotion = true;

  constructor(game) {
    this.game = game;
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.s = unit * 0.055;
    this.railY = z.y + z.h * 0.88;
    this.trainX = z.x + z.w * 0.8;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.speed = 0;
    this.dist = 0;
    this.scroll = 0;
    this.rot = 0;
    this.nextStation = STATION_EVERY;
    this.passengers = [];
    this.waiting = null;
    this.state = 'run';
    this.idle = 0;
    this.knees = { l: false, r: false };
    this.bob = null;
    this.smokeT = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.after(speak('제자리에서 무릎을 높이 올리며 달려 보세요! 빨리 달릴수록 기차가 빨라져요!'), () => {});
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

  // 이번 프레임에 새로 내디딘 걸음 수
  countSteps(pose) {
    if (!pose) return 0;
    const l = kneeUp(pose, 'l');
    const r = kneeUp(pose, 'r');
    let steps = 0;
    if (l !== null && r !== null) {
      if (l && !this.knees.l) steps++;
      if (r && !this.knees.r) steps++;
      this.knees = { l, r };
      return steps;
    }
    // 다리가 안 보이면 어깨가 들썩이는 것으로 걸음을 센다.
    const sh = shoulders(pose);
    if (!sh) return 0;
    const y = sh.my;
    const amp = sh.sw * BOB;
    const b = (this.bob ??= { dir: 'up', top: y, bottom: y });
    if (b.dir === 'up') {
      b.top = Math.min(b.top, y);
      if (y > b.top + amp) Object.assign(b, { dir: 'down', bottom: y });
    } else {
      b.bottom = Math.max(b.bottom, y);
      if (y < b.bottom - amp) {
        Object.assign(b, { dir: 'up', top: y });
        steps++;
      }
    }
    return steps;
  }

  onTap() {
    if (this.state === 'run') this.speed = Math.min(1, this.speed + STEP_BOOST);
  }

  update(dt, input) {
    const { zone: z, unit, particles } = this.game;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.passengers = [];
        this.state = 'run';
      }
      return;
    }
    if (this.state === 'station') return; // 동물이 타는 동안 기차는 멈춰 있다

    const steps = this.countSteps(input.pose);
    if (steps) sfx.chug();
    this.speed = Math.min(1, Math.max(0, this.speed + steps * STEP_BOOST - DECAY * dt));
    // 화면이 많이 움직이면(달리는 중) 최소 속도를 보장해 인식이 놓쳐도 기차가 멈추지 않게 한다.
    if (input.motion > 0.05) this.speed = Math.max(this.speed, Math.min(0.6, input.motion * 5));

    let travel = this.speed * MAX_TRAVEL * dt;
    if (this.dist + travel >= this.nextStation) {
      travel = this.nextStation - this.dist;
      this.arrive();
    }
    this.dist += travel;
    this.scroll += travel * z.w;
    this.rot += (travel * z.w) / (this.s * 0.3);

    this.idle = this.speed < 0.05 ? this.idle + dt : 0;
    if (this.idle > 7) {
      this.idle = 0;
      speak('칙칙폭폭! 제자리에서 달려 볼까요?');
    }

    // 굴뚝 연기: 빨리 달릴수록 자주
    this.smokeT -= dt * (0.5 + this.speed * 3);
    if (this.smokeT <= 0 && this.speed > 0.05) {
      this.smokeT = 0.3;
      const s = this.s;
      particles.burst(this.trainX - s * 0.58, this.railY - s * 2.1, { count: 1, colors: ['#ffffff'], speed: unit * 0.05, size: s * 0.35, gravity: -unit * 0.15, life: 1.2 });
    }

    // 다음 역에서 기다리는 동물
    if (!this.waiting && this.nextStation - this.dist < 1.2) {
      this.waiting = pick(PASSENGERS.filter((id) => !this.passengers.includes(id)));
    }
  }

  arrive() {
    this.state = 'station';
    this.speed = 0;
    this.waiting ??= pick(PASSENGERS.filter((id) => !this.passengers.includes(id)));
    sfx.whistle();
    const name = THINGS[this.waiting].name;
    this.after(speak(`${josa(name, '이', '가')} 기다려요!`), () => {
      this.passengers.push(this.waiting);
      this.pulse[this.passengers.length - 1] = 1;
      this.waiting = null;
      sfx.success();
      const { unit } = this.game;
      this.game.particles.burst(this.trainX - this.s * 4, this.railY - this.s * 1.5, { count: 24, colors: [COLORS.yellow, '#fff'], speed: unit * 0.5, size: unit * 0.02, shape: 'star', gravity: 200 });
      const done = this.passengers.length >= GOAL;
      const line = done ? '동물 친구들을 모두 태웠어요! 최고예요!' : `${josa(name, '이', '가')} 탔어요! 다시 출발!`;
      if (done) sfx.fanfare();
      this.after(speak(line), () => {
        this.nextStation += STATION_EVERY;
        if (done) {
          this.state = 'celebrate';
          this.stateT = 3;
          this.fireT = 0;
        } else {
          this.state = 'run';
        }
      });
    });
  }

  draw(ctx) {
    const { zone: z, unit } = this.game;
    const s = this.s;
    const ground = this.railY;

    // 언덕(멀리 있어서 천천히 지나간다)
    ctx.fillStyle = 'rgba(155,216,138,0.75)';
    const hillGap = z.w * 0.5;
    for (let x = z.x - ((this.scroll * 0.3) % hillGap) - hillGap; x < z.x + z.w + hillGap; x += hillGap) {
      ctx.beginPath();
      ctx.ellipse(x, ground, hillGap * 0.45, z.h * 0.22, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,200,110,0.95)';
    ctx.fillRect(z.x, ground, z.w, z.y + z.h - ground);

    // 나무(가까워서 빨리 지나간다)
    const treeGap = z.w * 0.35;
    for (let x = z.x - (this.scroll % treeGap); x < z.x + z.w + treeGap; x += treeGap) {
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(x - s * 0.15, ground - s * 2.2, s * 0.3, s * 1.4);
      ctx.fillStyle = '#4FA84F';
      ctx.beginPath();
      ctx.arc(x, ground - s * 2.6, s * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // 역과 기다리는 동물
    if (this.waiting || this.state === 'station') {
      const sx = this.trainX + (this.nextStation - this.dist) * z.w - s * 4;
      ctx.fillStyle = '#E9C893';
      ctx.fillRect(sx - s * 2.5, ground - s * 0.5, s * 5, s * 0.5);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(sx - s * 2.2, ground - s * 3.4, s * 4.4, s * 0.35);
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(sx - s * 2.0, ground - s * 3.1, s * 0.25, s * 2.6);
      ctx.fillRect(sx + s * 1.75, ground - s * 3.1, s * 0.25, s * 2.6);
      if (this.waiting) {
        const hop = Math.abs(Math.sin(this.game.time * 5)) * s * 0.3;
        THINGS[this.waiting].draw(ctx, sx, ground - s * 1.4 - hop, s * 0.8, this.game.time);
      }
    }

    // 레일
    ctx.fillStyle = '#8B5E3C';
    const tie = s * 1.2;
    for (let x = z.x - (this.scroll % tie); x < z.x + z.w; x += tie) ctx.fillRect(x, ground - s * 0.05, s * 0.35, s * 0.25);
    ctx.fillStyle = '#8D99AE';
    ctx.fillRect(z.x, ground - s * 0.08, z.w, s * 0.1);

    const passengers = this.passengers.map((id) => (c, x, y, r) => THINGS[id].draw(c, x, y, r, this.game.time));
    const bounce = this.speed > 0.05 ? Math.abs(Math.sin(this.rot * 0.5)) * s * 0.05 : 0;
    train(ctx, this.trainX, ground - bounce, s, this.rot, passengers);

    starGauge(ctx, this.game, GOAL, this.passengers.length, this.pulse);
    this.drawSpeed(ctx, unit);
  }

  // 왼쪽 아래 속도 막대(빨리 달릴수록 차오른다)
  drawSpeed(ctx, unit) {
    const { zone: z } = this.game;
    const w = unit * 0.035;
    const h = z.h * 0.45;
    const x = z.x + unit * 0.05;
    const y = z.y + z.h * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w / 2);
    ctx.fill();
    const fill = h * this.speed;
    if (fill > 1) {
      const g = ctx.createLinearGradient(0, y + h, 0, y);
      g.addColorStop(0, COLORS.green);
      g.addColorStop(0.6, COLORS.yellow);
      g.addColorStop(1, COLORS.red);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y + h - fill, w, fill, w / 2);
      ctx.fill();
    }
  }
}
