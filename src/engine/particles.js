import { note, star } from './draw.js';

const MAX_PARTICLES = 450;

export class ParticleSystem {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  add(p) {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push(p);
  }

  burst(x, y, { count = 24, colors = ['#fff'], speed = 300, size = 10, life = 0.9, gravity = 500, shape = 'circle' } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const l = life * (0.7 + Math.random() * 0.5);
      this.add({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity,
        size: size * (0.6 + Math.random() * 0.7),
        color: colors[(Math.random() * colors.length) | 0],
        shape,
        life: l,
        maxLife: l,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  // 퍼져 나가는 동그라미 물결
  ring(x, y, { color = '#fff', size = 60, life = 0.45 } = {}) {
    this.add({ x, y, vx: 0, vy: 0, gravity: 0, size, color, shape: 'ring', life, maxLife: life, rot: 0, vr: 0 });
  }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx) {
    ctx.save();
    for (const p of this.list) {
      const k = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      switch (p.shape) {
        case 'star':
          star(ctx, p.x, p.y, p.size, p.color);
          break;
        case 'note':
          note(ctx, p.x, p.y, p.size, p.color);
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.12 * k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - k), 0, Math.PI * 2);
          ctx.stroke();
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2);
          ctx.fill();
      }
    }
    ctx.restore();
  }
}
