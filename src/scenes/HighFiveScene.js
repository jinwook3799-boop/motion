import { star, COLORS } from '../engine/draw.js';
import { starGauge } from '../engine/icons.js';
import { P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework, handPoints, PLAYER_COLORS } from './common.js';

const GOAL = 10;
const ALONE_HINT_AFTER = 4; // 한 명만 보이면 이 시간(초) 뒤에 친구와 함께 하자고 알려 준다
const LEFT_HAND = new Set([P.lWrist, P.lIndex]);
// 손을 댄 것을 이 시간(초) 동안 기억한다. 아이들이 손을 '탁' 치고 바로 떼도 둘이 거의 같이 대면 인정된다.
const TOUCH_MEMORY = 0.5;

// 하이파이브 별: 큰 별에 두 아이가 "동시에" 손을 대야 터진다.
// 한 명만 있을 때는 두 손을 함께 대면 터진다(혼자서도 막히지 않게).
export class HighFiveScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  avatarColorOf(person) {
    return PLAYER_COLORS[this.rank(person.id)];
  }

  // 아이 id 순서대로 0, 1 (색깔 칸과 아바타 색을 맞추기 위해)
  rank(id) {
    return Math.max(0, this.ids.indexOf(id)) % 2;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.star = null;
    this.ids = [];
    this.aloneT = 0;
    this.aloneSaid = false;
    this.state = 'intro';
    this.after(speak('준비, 시작!'), () => this.spawn(this.game.people));
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

  // 두 아이 사이(둘 다 손이 닿는 곳)에 별을 띄운다.
  spawn(people) {
    const { zone: z, unit } = this.game;
    const r = unit * 0.1;
    let x = z.x + z.w * (0.3 + Math.random() * 0.4);
    if (people.length >= 2) x = (people[0].center.x + people[1].center.x) / 2 + (Math.random() - 0.5) * unit * 0.15;
    x = Math.min(z.x + z.w - r * 1.5, Math.max(z.x + r * 1.5, x));
    const y = z.y + z.h * (0.22 + Math.random() * 0.3);
    this.star = { x, y, r, age: 0, touch: [false, false], touched: new Map() };
    this.state = 'play';
    sfx.peek();
  }

  onTap(x, y) {
    if (this.state === 'play' && Math.hypot(x - this.star.x, y - this.star.y) < this.star.r * 1.5) this.pop();
  }

  update(dt, input) {
    const people = input.people;
    this.ids = people.map((p) => p.id);
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
        this.spawn(people);
      }
      return;
    }
    if (this.state !== 'play') return;

    const st = this.star;
    st.age += dt;
    st.y += Math.sin(st.age * 2) * this.game.unit * 0.02 * dt;

    // 별에 손을 댄 아이(와 어느 손인지)
    const reach = st.r * 1.3;
    const now = this.game.time;
    for (const p of people) {
      if (p.lost) continue;
      for (const idx of [P.lWrist, P.rWrist, P.lIndex, P.rIndex]) {
        const q = p.pose[idx];
        if (handPoints(p.pose).includes(q) && Math.hypot(q.x - st.x, q.y - st.y) < reach) {
          const left = LEFT_HAND.has(idx);
          st.touched.set(`${p.id}-${left}`, { id: p.id, left, at: now });
        }
      }
    }
    const touchers = [...st.touched.values()].filter((t) => now - t.at < TOUCH_MEMORY);
    const ids = new Set(touchers.map((t) => t.id));
    st.touch = [0, 1].map((k) => touchers.some((t) => this.rank(t.id) === k));

    const together = ids.size >= 2;
    const aloneBothHands = people.length === 1 && touchers.some((t) => t.left) && touchers.some((t) => !t.left);
    if (together || aloneBothHands) return this.pop();

    this.aloneT = people.length === 1 ? this.aloneT + dt : 0;
    if (this.aloneT > ALONE_HINT_AFTER && !this.aloneSaid) {
      this.aloneSaid = true;
      this.after(speak('친구랑 같이 손을 대요! 혼자라면 두 손으로 짝!'), () => {});
    }
  }

  pop() {
    const { particles, unit } = this.game;
    const st = this.star;
    sfx.success();
    sfx.sparkle(0.1);
    particles.burst(st.x, st.y, { count: 50, colors: [COLORS.yellow, '#fff', COLORS.pink, COLORS.blue], speed: unit * 0.9, size: unit * 0.025, shape: 'star', gravity: 150 });
    particles.ring(st.x, st.y, { color: '#fff', size: st.r * 1.3 });
    this.pulse[this.score] = 1;
    this.score++;
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('하이파이브 대장들! 정말 잘했어요!'), () => {});
      return;
    }
    this.state = 'wait';
    this.after(new Promise((r) => setTimeout(r, 700)), () => this.spawn(this.game.people));
  }

  draw(ctx) {
    const { time } = this.game;
    if (this.state === 'play') {
      const st = this.star;
      const appear = Math.min(1, st.age * 3);
      const k = (Math.sin(time * 4) + 1) / 2;
      ctx.fillStyle = `rgba(255,230,128,${0.25 + k * 0.2})`;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r * (1.45 + k * 0.15) * appear, 0, Math.PI * 2);
      ctx.fill();
      star(ctx, st.x, st.y, st.r * appear, COLORS.yellow, '#fff');
      // 두 친구 자리: 손을 대면 그 아이 색으로 채워진다.
      [0, 1].forEach((k2) => {
        const x = st.x + (k2 === 0 ? -1 : 1) * st.r * 0.75;
        const y = st.y + st.r * 1.55;
        ctx.fillStyle = st.touch[k2] ? PLAYER_COLORS[k2] : 'rgba(255,255,255,0.75)';
        ctx.strokeStyle = PLAYER_COLORS[k2];
        ctx.lineWidth = st.r * 0.08;
        ctx.beginPath();
        ctx.arc(x, y, st.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }
}
