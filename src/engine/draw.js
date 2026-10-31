// 캔버스용 그림 모음. 플랫 벡터 스타일, 원색, 웃는 얼굴(PRD 2.2).
export const COLORS = {
  red: '#FF5A5F',
  orange: '#FF9F1C',
  yellow: '#FFD23F',
  green: '#3BCEAC',
  blue: '#3A86FF',
  purple: '#9B5DE5',
  pink: '#F15BB5',
  ink: '#3D2C2E',
  cheek: '#FFB3C1',
};

export const RAINBOW = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.blue, COLORS.purple];

export function star(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.48;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// s = 얼굴 폭
export function smile(ctx, x, y, s) {
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.ellipse(x - s * 0.22, y - s * 0.08, s * 0.06, s * 0.085, 0, 0, Math.PI * 2);
  ctx.ellipse(x + s * 0.22, y - s * 0.08, s * 0.06, s * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(2, s * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y + s * 0.02, s * 0.17, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  ctx.globalAlpha *= 0.75;
  ctx.fillStyle = COLORS.cheek;
  ctx.beginPath();
  ctx.arc(x - s * 0.36, y + s * 0.08, s * 0.08, 0, Math.PI * 2);
  ctx.arc(x + s * 0.36, y + s * 0.08, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.75;
}

export function balloon(ctx, x, y, r, color) {
  ctx.save();
  ctx.strokeStyle = 'rgba(80,70,70,0.6)';
  ctx.lineWidth = Math.max(2, r * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.2);
  ctx.quadraticCurveTo(x - r * 0.25, y + r * 1.7, x, y + r * 2.3);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.08);
  ctx.lineTo(x - r * 0.13, y + r * 1.26);
  ctx.lineTo(x + r * 0.13, y + r * 1.26);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.42, y - r * 0.48, r * 0.15, r * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fill();

  smile(ctx, x, y + r * 0.12, r * 1.1);
  ctx.restore();
}

// 무섭지 않은 동글동글 꼬마 괴물
export function monster(ctx, x, y, r, color, t = 0) {
  ctx.save();
  const squash = 1 + Math.sin(t * 6) * 0.05;
  ctx.translate(x, y);
  ctx.scale(1 / squash, squash);

  ctx.fillStyle = COLORS.yellow;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.35, -r * 0.8);
    ctx.lineTo(side * r * 0.62, -r * 1.25);
    ctx.lineTo(side * r * 0.7, -r * 0.62);
    ctx.fill();
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  for (const fx of [-0.5, 0, 0.5]) {
    ctx.moveTo(r * fx + r * 0.22, r * 0.9);
    ctx.arc(r * fx, r * 0.9, r * 0.22, 0, Math.PI * 2);
  }
  ctx.fill();

  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(side * r * 0.36, -r * 0.18, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(side * r * 0.32, -r * 0.12, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(0, r * 0.25, r * 0.32, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r * 0.12, r * 0.25, r * 0.24, r * 0.1);

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = COLORS.cheek;
  ctx.beginPath();
  ctx.arc(-r * 0.68, r * 0.2, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.68, r * 0.2, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drum(ctx, x, y, r) {
  ctx.save();
  const top = y - r * 0.35;
  const bottom = y + r * 0.6;

  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.ellipse(x, bottom, r, r * 0.32, 0, 0, Math.PI);
  ctx.lineTo(x - r, top);
  ctx.lineTo(x + r, top);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = r * 0.1;
  for (const by of [top + r * 0.22, bottom - r * 0.05]) {
    ctx.beginPath();
    ctx.ellipse(x, by, r, r * 0.32, 0, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
  }

  ctx.fillStyle = '#FFF1D6';
  ctx.strokeStyle = '#E9C893';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.ellipse(x, top, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  smile(ctx, x, y + r * 0.22, r * 0.75);
  ctx.restore();
}

export function cymbal(ctx, x, y, r, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.strokeStyle = '#8D99AE';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, r * 0.9);
  ctx.stroke();

  ctx.fillStyle = '#F4C430';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#E0A800';
  ctx.lineWidth = r * 0.03;
  for (const k of [0.75, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * k, r * 0.26 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#FFE680';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.03, r * 0.16, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.5, -r * 0.08, r * 0.2, r * 0.05, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function note(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.42, s * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.36, y - s * 0.1);
  ctx.lineTo(x + s * 0.36, y - s * 1.2);
  ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.9, x + s * 0.85, y - s * 0.6);
  ctx.stroke();
}

export function playIcon(ctx, r) {
  ctx.fillStyle = COLORS.green;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.25, -r * 0.4);
  ctx.lineTo(r * 0.45, 0);
  ctx.lineTo(-r * 0.25, r * 0.4);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = '#fff';
  ctx.fill();
  ctx.stroke();
}

// 손을 올려 두면 차오르는 원형 진행 표시
export function progressRing(ctx, x, y, r, p, color) {
  if (p <= 0) return;
  ctx.save();
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.08, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 카메라 앞에 서 달라는 안내용 아이 실루엣
export function childSilhouette(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.55, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, x - s * 0.38, y - s * 0.2, s * 0.76, s * 0.85, s * 0.3);
  ctx.fill();
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y);
  ctx.lineTo(x - s * 0.75, y - s * 0.45);
  ctx.moveTo(x + s * 0.35, y);
  ctx.lineTo(x + s * 0.75, y - s * 0.45);
  ctx.stroke();
}

export function lightBulb(ctx, x, y, s) {
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.15, s * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8D99AE';
  roundRect(ctx, x - s * 0.22, y + s * 0.25, s * 0.44, s * 0.3, s * 0.08);
  ctx.fill();
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * s * 0.6, y - s * 0.15 + Math.sin(a) * s * 0.6);
    ctx.lineTo(x + Math.cos(a) * s * 0.8, y - s * 0.15 + Math.sin(a) * s * 0.8);
    ctx.stroke();
  }
}
