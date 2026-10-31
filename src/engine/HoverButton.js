import { progressRing } from './draw.js';

// 손을 아이콘 위에 잠시 올려 두면(dwell) 눌리는 버튼. 터치/클릭으로도 바로 누를 수 있다.
export class HoverButton {
  constructor({ drawIcon, onActivate, onHoverStart, ringColor = '#FFD23F', dwell = 1.0 }) {
    this.drawIcon = drawIcon;
    this.onActivate = onActivate;
    this.onHoverStart = onHoverStart;
    this.ringColor = ringColor;
    this.dwell = dwell;
    this.x = 0;
    this.y = 0;
    this.r = 100;
    this.progress = 0;
    this.hover = false;
    this.cooldown = 0;
    this.t = 0;
    this.disabled = false;
    // 장면에서 꾸밈용으로 조절하는 값
    this.boost = 1;
    this.offsetX = 0;
  }

  place(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;
  }

  contains(p, pad = 0) {
    return Math.hypot(p.x - this.x, p.y - this.y) <= this.r + pad;
  }

  update(dt, pointers) {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const wasHover = this.hover;
    this.hover = !this.disabled && pointers.some((p) => this.contains(p, this.r * 0.15));
    if (this.hover && !wasHover) this.onHoverStart?.();
    if (this.hover && this.cooldown === 0) {
      this.progress += dt / this.dwell;
      if (this.progress >= 1) this.activate();
    } else {
      this.progress = Math.max(0, this.progress - dt * 1.5);
    }
  }

  tap(x, y) {
    if (this.disabled || !this.contains({ x, y })) return false;
    this.activate();
    return true;
  }

  activate() {
    this.progress = 0;
    this.cooldown = 1;
    this.onActivate?.();
  }

  draw(ctx) {
    const s = (1 + (this.hover ? 0.08 : 0) + Math.sin(this.t * 3) * 0.03) * this.boost;
    ctx.save();
    ctx.translate(this.x + this.offsetX, this.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(0, this.r * 0.06, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    this.drawIcon(ctx, this.r, this.t);
    progressRing(ctx, 0, 0, this.r, this.progress, this.ringColor);
    ctx.restore();
  }
}
