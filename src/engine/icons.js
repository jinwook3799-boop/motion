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

// 화면 위쪽 가운데의 별 게이지(모은 별 수)
export function starGauge(ctx, game, goal, score, pulse) {
  const { w, h, unit } = game;
  const s = Math.min(unit * 0.035, w / (goal * 3));
  const gap = s * 2.5;
  const y = h * 0.055 + s;
  const x0 = w / 2 - (gap * (goal - 1)) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.roundRect(x0 - s * 1.6, y - s * 1.5, gap * (goal - 1) + s * 3.2, s * 3, s * 1.5);
  ctx.fill();
  for (let i = 0; i < goal; i++) {
    const filled = i < score;
    star(ctx, x0 + i * gap, y, s * (1 + pulse[i] * 0.6), filled ? COLORS.yellow : 'rgba(61,44,46,0.15)', filled ? '#F4A100' : null);
  }
}

// 장난감 뿅망치. swing(0~1)만큼 내려친 모습
export function hammer(ctx, x, y, s, swing = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.6 + swing * 0.9);
  ctx.fillStyle = '#E9C893';
  roundRect(ctx, -s * 0.1, -s * 0.2, s * 0.2, s * 1.2, s * 0.08);
  ctx.fill();
  ctx.fillStyle = COLORS.red;
  roundRect(ctx, -s * 0.55, -s * 0.55, s * 1.1, s * 0.5, s * 0.2);
  ctx.fill();
  ctx.fillStyle = COLORS.yellow;
  roundRect(ctx, -s * 0.6, -s * 0.58, s * 0.18, s * 0.56, s * 0.08);
  ctx.fill();
  roundRect(ctx, s * 0.42, -s * 0.58, s * 0.18, s * 0.56, s * 0.08);
  ctx.fill();
  ctx.restore();
}

export function heart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.85);
  ctx.bezierCurveTo(x - s * 1.3, y - s * 0.05, x - s * 0.65, y - s * 1.05, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.65, y - s * 1.05, x + s * 1.3, y - s * 0.05, x, y + s * 0.85);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.45, y - s * 0.35, s * 0.12, s * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function apple(ctx, x, y, s) {
  ctx.strokeStyle = '#7A4E2D';
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.6);
  ctx.lineTo(x + s * 0.1, y - s * 1.0);
  ctx.stroke();
  ctx.fillStyle = '#5BC85B';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.38, y - s * 0.88, s * 0.3, s * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.arc(x - s * 0.38, y, s * 0.62, 0, Math.PI * 2);
  ctx.arc(x + s * 0.38, y, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.55, y - s * 0.25, s * 0.12, s * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, x, y + s * 0.1, s * 0.85);
}

export function fish(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.55, y);
  ctx.lineTo(x + s * 1.1, y - s * 0.5);
  ctx.lineTo(x + s * 1.1, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - s * 0.1, y, s * 0.8, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.05, y + s * 0.15, s * 0.4, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - s * 0.45, y - s * 0.12, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(x - s * 0.48, y - s * 0.12, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  ctx.arc(x - s * 0.62, y + s * 0.12, s * 0.12, 0.2, Math.PI * 0.8);
  ctx.stroke();
}

export function magnifier(ctx, r) {
  ctx.strokeStyle = '#7A4E2D';
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.18, r * 0.18);
  ctx.lineTo(r * 0.55, r * 0.55);
  ctx.stroke();
  ctx.fillStyle = '#CDE7FF';
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(-r * 0.12, -r * 0.12, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  star(ctx, -r * 0.12, -r * 0.12, r * 0.18, COLORS.yellow);
}

// 소리 다시 듣기 아이콘
export function speakerIcon(ctx, r, t = 0) {
  ctx.fillStyle = COLORS.purple;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.15);
  ctx.lineTo(-r * 0.2, -r * 0.15);
  ctx.lineTo(r * 0.05, -r * 0.38);
  ctx.lineTo(r * 0.05, r * 0.38);
  ctx.lineTo(-r * 0.2, r * 0.15);
  ctx.lineTo(-r * 0.4, r * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.max(0, Math.sin(t * 4 - i));
    ctx.beginPath();
    ctx.arc(r * 0.05, 0, r * (0.25 + i * 0.17), -0.7, 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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

// 단계 표시(별 게이지 바로 아래): 지난 단계는 초록, 지금 단계는 크게 깜빡이는 주황, 남은 단계는 회색 동그라미
export function levelSteps(ctx, game, level, total, pulse = 0) {
  const { w, h, unit, time } = game;
  const s = Math.min(unit * 0.035, w / 30);
  const r = s * 0.95;
  const gap = r * 2.9;
  const y = h * 0.055 + s * 4.3;
  const x0 = w / 2 - (gap * (total - 1)) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.roundRect(x0 - r * 1.8, y - r * 1.6, gap * (total - 1) + r * 3.6, r * 3.2, r * 1.6);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < total; i++) {
    const n = i + 1;
    const x = x0 + i * gap;
    const now = n === level;
    const k = now ? 1.25 + Math.sin(time * 5) * 0.06 + pulse * 0.5 : 1;
    ctx.fillStyle = n < level ? COLORS.green : now ? COLORS.orange : 'rgba(61,44,46,0.15)';
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = n <= level ? '#fff' : 'rgba(61,44,46,0.4)';
    ctx.font = `800 ${Math.round(r * k * 1.25)}px system-ui, sans-serif`;
    ctx.fillText(String(n), x, y + r * 0.08);
  }
  ctx.restore();
}
