import { cymbal, drum, roundRect, COLORS } from '../engine/draw.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { sweepPoints } from '../engine/hit.js';

// 위에서 아래로: 높은 음 → 낮은 음 (C 펜타토닉)
const XYLO_NOTES = [880, 783.99, 659.25, 587.33, 523.25];
const XYLO_COLORS = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.blue];
const RETRIGGER = 0.15; // 같은 악기를 연속으로 울리는 최소 간격(초)
const STRIKE_PARTS = new Set(['tip', 'palm']);

// 모듈 5. 매직 악기: 좌-북, 우-실로폰, 상-심벌즈
export class InstrumentScene {
  constructor(game) {
    this.game = game;
    this.prevTargets = new Map();
    this.lastStrike = {};
  }

  onResize() {
    const z = this.game.zone;
    const sideW = z.w * 0.3;
    const lowY = z.y + z.h * 0.38;
    const lowH = z.y + z.h - lowY;
    this.drum = { id: 'drum', x: z.x, y: lowY, w: sideW, h: lowH, hit: 0, color: COLORS.red };
    this.cymbal = { id: 'cymbal', x: z.x + z.w * 0.3, y: z.y, w: z.w * 0.4, h: z.h * 0.32, hit: 0, color: COLORS.yellow };
    this.xylo = { id: 'xylo', x: z.x + z.w - sideW, y: lowY, w: sideW, h: lowH, hit: 0, color: COLORS.blue };
    this.bars = XYLO_NOTES.map((freq, i) => ({ id: `xylo${i}`, freq, color: XYLO_COLORS[i], hit: 0, index: i }));
  }

  enter() {
    this.prevTargets.clear();
    speak('연주를 시작해요!');
  }

  targetAt(p) {
    // 왼쪽 아래 집 버튼 위는 북에서 뺀다(집 버튼에 손을 올려도 북이 울리지 않게).
    if (this.game.homeButton.contains(p, this.game.homeButton.r * 0.15)) return null;
    const pad = this.game.unit * 0.02;
    const inside = (r) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
    if (inside(this.cymbal)) return this.cymbal;
    if (inside(this.drum)) return this.drum;
    if (inside(this.xylo)) {
      const i = Math.floor(((p.y - this.xylo.y) / this.xylo.h) * this.bars.length);
      return this.bars[Math.max(0, Math.min(this.bars.length - 1, i))];
    }
    return null;
  }

  update(dt, input) {
    // 영역 "밖→안"으로 들어오는 순간에만 소리를 낸다.
    const seen = new Map();
    for (const p of input.pointers) {
      if (!STRIKE_PARTS.has(p.part)) continue;
      // 빠르게 내려치면 두 프레임 사이에 악기를 지나칠 수 있어, 지나간 길 위의 점들도 확인한다.
      const prev = this.prevTargets.get(p.key);
      let target = null;
      for (const q of sweepPoints(p, this.game.unit * 0.03)) {
        target = this.targetAt(q);
        if (target && target !== prev) {
          this.strike(target, p);
          break;
        }
      }
      seen.set(p.key, this.targetAt(p));
    }
    this.prevTargets = seen;

    for (const t of [this.drum, this.cymbal, this.xylo, ...this.bars]) t.hit = Math.max(0, t.hit - dt * 3);
  }

  strike(target, p) {
    const now = this.game.time;
    if (now - (this.lastStrike[target.id] ?? -1) < RETRIGGER) return;
    this.lastStrike[target.id] = now;
    target.hit = 1;

    if (target === this.drum) sfx.drum();
    else if (target === this.cymbal) sfx.cymbal();
    else {
      this.xylo.hit = 1;
      sfx.xylophone(target.freq);
    }

    const { particles, unit } = this.game;
    particles.burst(p.x, p.y, { count: 6, colors: [target.color, COLORS.purple, COLORS.pink], speed: unit * 0.35, size: unit * 0.04, shape: 'note', gravity: -unit * 0.4, life: 1.1 });
    particles.ring(p.x, p.y, { color: target.color, size: unit * 0.06 });
  }

  draw(ctx) {
    const { unit, time } = this.game;
    for (const zone of [this.drum, this.cymbal, this.xylo]) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, zone.x, zone.y, zone.w, zone.h, unit * 0.04);
      ctx.fill();
      ctx.lineWidth = unit * 0.008;
      ctx.strokeStyle = zone.color;
      ctx.globalAlpha = 0.5 + zone.hit * 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const d = this.drum;
    const dr = Math.min(d.w, d.h) * 0.38 * (1 + d.hit * 0.12);
    drum(ctx, d.x + d.w / 2, d.y + d.h / 2 + Math.sin(time * 60) * d.hit * unit * 0.008, dr);

    const c = this.cymbal;
    const cr = Math.min(c.w * 0.42, c.h * 1.2) * (1 + c.hit * 0.08);
    cymbal(ctx, c.x + c.w / 2, c.y + c.h * 0.45, cr, Math.sin(time * 40) * c.hit * 0.25);

    this.drawXylophone(ctx);
  }

  drawXylophone(ctx) {
    const x = this.xylo;
    const { unit } = this.game;
    const n = this.bars.length;
    const rowH = x.h / n;
    const cx = x.x + x.w / 2;
    for (const bar of this.bars) {
      const bw = x.w * (0.55 + 0.08 * bar.index) * (1 + bar.hit * 0.08);
      const bh = rowH * 0.7;
      const by = x.y + rowH * bar.index + (rowH - bh) / 2 - bar.hit * unit * 0.008;
      ctx.fillStyle = bar.color;
      roundRect(ctx, cx - bw / 2, by, bw, bh, bh * 0.35);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * bw * 0.38, by + bh / 2, bh * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
