// 메뉴·게임 화면용 캔버스 아이콘
import { roundRect, smile, star, COLORS, RAINBOW } from './draw.js';

export function homeIcon(ctx, r) {
  const s = r * 0.55;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = COLORS.yellow;
  ctx.strokeStyle = COLORS.orange;
  ctx.lineWidth = s * 0.16;
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, -s * 0.05);
  ctx.lineTo(-s * 0.6, s * 0.7);
  ctx.lineTo(s * 0.6, s * 0.7);
  ctx.lineTo(s * 0.6, -s * 0.05);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, 0);
  ctx.lineTo(0, -s * 0.75);
  ctx.lineTo(s * 0.85, 0);
  ctx.stroke();
  ctx.fillStyle = COLORS.orange;
  roundRect(ctx, -s * 0.15, s * 0.2, s * 0.3, s * 0.5, s * 0.08);
  ctx.fill();
}

// 세로 신호등. active: 'red' | 'green' | null
export function trafficLight(ctx, x, y, s, active) {
  ctx.fillStyle = COLORS.ink;
  roundRect(ctx, x - s * 0.6, y - s * 1.15, s * 1.2, s * 2.3, s * 0.4);
  ctx.fill();
  const lamps = [
    { key: 'red', color: COLORS.red, y: y - s * 0.55 },
    { key: 'green', color: COLORS.green, y: y + s * 0.55 },
  ];
  for (const lamp of lamps) {
    const on = lamp.key === active;
    ctx.globalAlpha = on ? 1 : 0.25;
    ctx.fillStyle = lamp.color;
    ctx.beginPath();
    ctx.arc(x, lamp.y, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (on) smile(ctx, x, lamp.y + s * 0.02, s * 0.6);
  }
}

export function rainbowIcon(ctx, r) {
  ctx.lineCap = 'butt';
  ctx.lineWidth = r * 0.13;
  RAINBOW.forEach((color, i) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, r * 0.4, r * (0.95 - i * 0.13), Math.PI, Math.PI * 2);
    ctx.stroke();
  });
  ctx.fillStyle = '#CDE7FF';
  for (const side of [-1, 1]) {
    for (const [dx, dy, rr] of [[0, 0, 0.2], [0.18, 0.05, 0.16], [-0.18, 0.06, 0.15]]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.62 + dx * r, r * 0.45 + dy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function footprint(ctx, x, y, s, color, flip = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.rotate(0.15);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.25, s * 0.42, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy, r] of [[-0.42, -0.5, 0.15], [-0.12, -0.68, 0.16], [0.2, -0.62, 0.14], [0.45, -0.4, 0.12]]) {
    ctx.beginPath();
    ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 물감 물방울. fill 이 'rainbow' 면 무지개색
export function paintDrop(ctx, x, y, r, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.75);
  ctx.bezierCurveTo(x + r * 0.2, y - r * 1.2, x + r, y - r * 0.6, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.2, y - r * 1.2, x, y - r * 1.75);
  ctx.closePath();
  if (fill === 'rainbow') {
    const g = ctx.createLinearGradient(x, y - r * 1.7, x, y + r);
    RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = fill;
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y - r * 0.2, r * 0.15, r * 0.3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, x + r * 0.05, y + r * 0.2, r * 0.9);
  ctx.restore();
}

// 신호등 놀이의 춤추는 친구. phase 가 커질수록 춤 동작이 진행된다.
export function buddy(ctx, x, y, s, phase, frozen) {
  ctx.save();
  ctx.translate(x, y);
  if (!frozen) {
    ctx.rotate(Math.sin(phase) * 0.15);
    ctx.translate(0, -Math.abs(Math.sin(phase * 2)) * s * 0.15);
  }
  const body = frozen ? '#A9DEF9' : COLORS.orange;
  const swing = frozen ? 0.6 : Math.sin(phase * 2) * 0.9;
  ctx.strokeStyle = body;
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.75, 0);
    ctx.lineTo(side * s * 1.3, -s * 0.2 - side * swing * s * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * s * 0.35, s * 0.85);
    ctx.lineTo(side * s * 0.45, s * 1.35 - (frozen ? 0 : Math.max(0, side * Math.sin(phase * 2)) * s * 0.25));
    ctx.stroke();
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, 0, -s * 0.05, s * 1.2);
  if (frozen) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.08, 0, Math.PI * 2);
    ctx.stroke();
    star(ctx, -s * 0.7, -s * 0.75, s * 0.18, '#fff');
    star(ctx, s * 0.8, s * 0.55, s * 0.14, '#fff');
  }
  ctx.restore();
}

export function questionMark(ctx, r, t = 0) {
  ctx.fillStyle = COLORS.purple;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${r * 1.1}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, r * 0.06);
  for (let i = 0; i < 3; i++) {
    const a = t * 1.5 + (i * Math.PI * 2) / 3;
    star(ctx, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.12, COLORS.yellow);
  }
}
