import { COLORS } from '../engine/draw.js';
import { paintDrop } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const LINE_LIFE = 6; // 선이 남아 있는 시간(초)
const FADE = 1.5; // 사라지기 전 반짝이는 시간(초)
// 검지를 폈는지 판단: (손목→검지 끝) / (손목→검지 가운데 마디) 비율.
// 펴면 1.4 이상, 주먹을 쥐면 1 안팎. 두 기준을 달리 둬서 경계에서 깜빡이지 않게 한다.
const PEN_DOWN_RATIO = 1.25;
const PEN_UP_RATIO = 1.08;
const SMOOTHING = 0.45; // 낮을수록 손끝 떨림이 줄지만 선이 늦게 따라온다
const DROPS = [
  { color: 'rainbow', name: '무지개!' },
  { color: COLORS.red, name: '빨강!' },
  { color: COLORS.yellow, name: '노랑!' },
  { color: COLORS.green, name: '초록!' },
  { color: COLORS.blue, name: '파랑!' },
  { color: COLORS.purple, name: '보라!' },
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 모듈 6. 모션 드로잉(무지개 선)
export class DrawingScene {
  hideTrail = true;
  hideCursor = true;

  constructor(game) {
    this.game = game;
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.dropR = Math.min(unit * 0.045, z.h / (DROPS.length * 3.2));
    const gap = z.h / DROPS.length;
    this.drops = DROPS.map((d, i) => ({ ...d, x: z.x + z.w - this.dropR * 1.6, y: z.y + gap * (i + 0.5) + this.dropR * 0.4, pulse: 0 }));
  }

  enter() {
    this.t = 0;
    this.strokes = [];
    this.active = new Map();
    this.penDown = new Map();
    this.smooth = new Map();
    this.pens = [];
    this.color = 'rainbow';
    this.hue = 0;
    this.twinkleT = 0;
    speak('손가락을 쭉 펴면 그림이 그려지고, 주먹을 쥐면 멈춰요! 물방울을 만지면 색깔이 바뀌어요!');
  }

  dropAt(p) {
    return this.drops.find((d) => Math.hypot(p.x - d.x, p.y - (d.y - this.dropR * 0.4)) < this.dropR * 1.6);
  }

  pickColor(drop) {
    drop.pulse = 1;
    if (drop.color === this.color) return;
    this.color = drop.color;
    sfx.bloop();
    speak(drop.name);
    const colors = drop.color === 'rainbow' ? [COLORS.red, COLORS.yellow, COLORS.green, COLORS.blue] : [drop.color, '#fff'];
    this.game.particles.burst(drop.x, drop.y, { count: 16, colors, speed: this.game.unit * 0.4, size: this.game.unit * 0.012, gravity: 400 });
  }

  // 손마다 펜 하나: 검지 끝 위치(떨림 보정) + 검지를 폈는지(펜 내림) 여부
  readPens(input) {
    const unit = this.game.unit;
    const pens = [];
    input.hands.forEach((hand, i) => {
      const key = `h${i}`;
      const [wrist, pip, tip] = [hand.points[0], hand.points[6], hand.points[8]];
      const ratio = dist(wrist, tip) / Math.max(1, dist(wrist, pip));
      const down = ratio > (this.penDown.get(key) ? PEN_UP_RATIO : PEN_DOWN_RATIO);
      this.penDown.set(key, down);
      pens.push({ key, x: tip.x, y: tip.y, down });
    });
    const mouse = input.pointers.find((p) => p.key === 'mouse');
    if (mouse) pens.push({ key: 'mouse', x: mouse.x, y: mouse.y, down: true });

    for (const pen of pens) {
      const prev = this.smooth.get(pen.key);
      if (prev && dist(prev, pen) < unit * 0.25) {
        pen.x = prev.x + (pen.x - prev.x) * SMOOTHING;
        pen.y = prev.y + (pen.y - prev.y) * SMOOTHING;
      }
      this.smooth.set(pen.key, { x: pen.x, y: pen.y });
    }
    const keys = new Set(pens.map((p) => p.key));
    for (const key of [...this.smooth.keys()]) if (!keys.has(key)) this.smooth.delete(key);
    return pens;
  }

  update(dt, input) {
    this.t += dt;
    this.twinkleT -= dt;
    const unit = this.game.unit;
    for (const d of this.drops) d.pulse = Math.max(0, d.pulse - dt * 3);

    this.pens = this.readPens(input);
    const seen = new Set();
    for (const p of this.pens) {
      if (!this.game.inZone(p)) continue;
      // 물방울은 손가락을 폈든 접었든 닿기만 하면 색이 바뀐다.
      const drop = this.dropAt(p);
      if (drop) {
        this.pickColor(drop);
        continue;
      }
      if (!p.down) continue;
      let stroke = this.active.get(p.key);
      const last = stroke?.points.at(-1);
      const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : 0;
      // 손을 잃었다가 멀리서 다시 잡히면 새 선으로 시작한다.
      if (!stroke || dist > unit * 0.25) {
        stroke = { color: this.color, points: [] };
        this.strokes.push(stroke);
        this.active.set(p.key, stroke);
      }
      if (!last || dist > 2) {
        this.hue = (this.hue + dist * 0.6) % 360;
        stroke.points.push({ x: p.x, y: p.y, t: this.t, hue: this.hue });
        if (dist > unit * 0.02 && this.twinkleT <= 0) {
          this.twinkleT = 0.12;
          sfx.twinkle();
        }
      }
      seen.add(p.key);
    }
    for (const key of [...this.active.keys()]) if (!seen.has(key)) this.active.delete(key);

    // 오래된 선은 반짝이며 사라진다.
    const { particles } = this.game;
    for (const s of this.strokes) {
      while (s.points.length && this.t - s.points[0].t > LINE_LIFE) s.points.shift();
      for (const pt of s.points) {
        const age = this.t - pt.t;
        if (age > LINE_LIFE - FADE && Math.random() < dt * 0.8) {
          particles.burst(pt.x, pt.y, { count: 1, colors: ['#fff', COLORS.yellow], speed: unit * 0.05, size: unit * 0.012, shape: 'star', gravity: -40, life: 0.6 });
        }
      }
    }
    this.strokes = this.strokes.filter((s) => s.points.length || [...this.active.values()].includes(s));
  }

  draw(ctx) {
    const unit = this.game.unit;
    const width = unit * 0.024;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 테두리(흰 빛)를 먼저 전부 그리고 그 위에 색 선을 그려야 마디가 구슬처럼 보이지 않는다.
    for (const glow of [true, false]) {
      for (const s of this.strokes) {
        const pts = s.points;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const age = this.t - b.t;
          const fading = age > LINE_LIFE - FADE;
          const shimmer = fading ? 1 + Math.sin(this.t * 20 + i) * 0.25 : 1;
          ctx.globalAlpha = fading ? Math.max(0, (LINE_LIFE - age) / FADE) : 1;
          if (glow) {
            ctx.strokeStyle = '#FFF8E7';
            ctx.lineWidth = width * 1.8 * shimmer;
          } else {
            ctx.strokeStyle = s.color === 'rainbow' ? `hsl(${b.hue}, 95%, 58%)` : s.color;
            ctx.lineWidth = width * shimmer;
          }
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    for (const d of this.drops) {
      const selected = d.color === this.color;
      const r = this.dropR * (selected ? 1.25 : 1) * (1 + d.pulse * 0.3);
      if (selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(d.x, d.y - r * 0.4, r * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      paintDrop(ctx, d.x, d.y, r, d.color);
    }

    // 펜 커서: 그리는 중이면 지금 색으로 채운 동그라미, 쉬는 중이면 빈 동그라미
    for (const p of this.pens) {
      ctx.save();
      ctx.lineWidth = unit * 0.008;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      if (p.down) {
        ctx.arc(p.x, p.y, width * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = this.color === 'rainbow' ? `hsl(${this.hue}, 95%, 58%)` : this.color;
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([unit * 0.012, unit * 0.01]);
        ctx.arc(p.x, p.y, unit * 0.03, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}
