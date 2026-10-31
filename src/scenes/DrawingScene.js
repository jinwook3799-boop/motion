import { COLORS } from '../engine/draw.js';
import { paintDrop } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const LINE_LIFE = 6; // 선이 남아 있는 시간(초)
const FADE = 1.5; // 사라지기 전 반짝이는 시간(초)
// 손바닥 중심으로 그린다. 손가락 끝보다 크게 보여 인식이 끊기지 않고, 손짓을 몰라도 된다.
// 손을 내리거나 화면 밖으로 빼면 멈춘다.
const SMOOTHING = 0.5; // 낮을수록 떨림이 줄지만 선이 늦게 따라온다
const BRIDGE_TIME = 0.4; // 손을 이만큼(초) 잠깐 놓쳐도 근처에서 다시 잡히면 선을 이어 그린다
const RECONNECT = 0.35; // 이어 그릴 수 있는 최대 거리(화면 짧은 변 대비)
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
    this.active = new Map(); // 펜 key → { stroke, seen }
    this.smooth = new Map();
    this.pens = [];
    this.color = 'rainbow';
    this.hue = 0;
    this.twinkleT = 0;
    speak('쓱쓱 그려 볼까요?');
  }

  dropAt(p) {
    return this.drops.find((d) => Math.hypot(p.x - d.x, p.y - (d.y - this.dropR * 0.4)) < this.dropR * 1.8);
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

  // 손마다 펜 하나: 손바닥 중심(떨림 보정). 물방울 판정용으로 손끝도 함께 둔다.
  readPens(input) {
    const unit = this.game.unit;
    // 손마다 고유 id 로 펜을 구분해 두 아이가 함께 그려도 선이 섞이지 않는다. 잠깐 놓친 손(lost)은 선을 잇지 않는다.
    const pens = input.hands.filter((h) => !h.lost).map((hand) => ({ key: `h${hand.id}`, x: hand.palm.x, y: hand.palm.y, tip: hand.tip }));
    const mouse = input.pointers.find((p) => p.key === 'mouse');
    if (mouse) pens.push({ key: 'mouse', x: mouse.x, y: mouse.y, tip: mouse });

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
    for (const p of this.pens) {
      if (!this.game.inZone(p)) continue;
      // 물방울은 손바닥이나 손끝이 닿으면 색이 바뀐다.
      const drop = this.dropAt(p) ?? this.dropAt(p.tip);
      if (drop) {
        this.pickColor(drop);
        continue;
      }
      const entry = this.active.get(p.key);
      let stroke = entry?.stroke;
      const last = stroke?.points.at(-1);
      const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : 0;
      // 손을 잃었다가 멀리서 다시 잡히면 새 선으로 시작한다.
      if (!stroke || dist > unit * RECONNECT) {
        stroke = { color: this.color, points: [] };
        this.strokes.push(stroke);
      }
      this.active.set(p.key, { stroke, seen: this.t });
      if (!last || dist > 2) {
        this.hue = (this.hue + dist * 0.6) % 360;
        stroke.points.push({ x: p.x, y: p.y, t: this.t, hue: this.hue });
        if (dist > unit * 0.02 && this.twinkleT <= 0) {
          this.twinkleT = 0.12;
          sfx.twinkle();
        }
      }
    }
    for (const [key, entry] of this.active) if (this.t - entry.seen > BRIDGE_TIME) this.active.delete(key);

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
    const drawing = new Set([...this.active.values()].map((e) => e.stroke));
    this.strokes = this.strokes.filter((s) => s.points.length || drawing.has(s));
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

    // 펜 커서: 손바닥 위치에 지금 색으로 채운 동그라미
    for (const p of this.pens) {
      ctx.save();
      ctx.lineWidth = unit * 0.01;
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = this.color === 'rainbow' ? `hsl(${this.hue}, 95%, 58%)` : this.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}
