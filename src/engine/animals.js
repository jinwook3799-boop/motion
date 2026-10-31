// 동물 친구 그림. 모두 (ctx, 중심 x, 중심 y, 크기 s, 시간 t) 형식이며 s ≈ 몸 반지름.
import { smile, COLORS } from './draw.js';

const circle = (ctx, x, y, r, fill) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

const ellipse = (ctx, x, y, rx, ry, fill, rot = 0) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
};

export function frog(ctx, x, y, s) {
  const green = '#5BC85B';
  ellipse(ctx, x - s * 0.7, y + s * 0.6, s * 0.35, s * 0.18, '#4AA84A');
  ellipse(ctx, x + s * 0.7, y + s * 0.6, s * 0.35, s * 0.18, '#4AA84A');
  ellipse(ctx, x, y + s * 0.1, s, s * 0.75, green);
  for (const side of [-1, 1]) {
    circle(ctx, x + side * s * 0.45, y - s * 0.55, s * 0.3, green);
    circle(ctx, x + side * s * 0.45, y - s * 0.55, s * 0.2, '#fff');
    circle(ctx, x + side * s * 0.45, y - s * 0.5, s * 0.1, COLORS.ink);
  }
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.05, s * 0.45, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.globalAlpha *= 0.7;
  circle(ctx, x - s * 0.62, y + s * 0.12, s * 0.12, COLORS.cheek);
  circle(ctx, x + s * 0.62, y + s * 0.12, s * 0.12, COLORS.cheek);
  ctx.globalAlpha /= 0.7;
}

// 아기 새: t에 따라 날개를 파닥인다.
export function chick(ctx, x, y, s, t = 0) {
  const flap = Math.sin(t * 12) * 0.6;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * s * 0.8, y + s * 0.05);
    ctx.rotate(side * (0.4 + flap));
    ellipse(ctx, side * s * 0.25, 0, s * 0.4, s * 0.2, '#FFC300');
    ctx.restore();
  }
  circle(ctx, x, y, s, COLORS.yellow);
  ellipse(ctx, x - s * 0.08, y - s * 1.0, s * 0.08, s * 0.18, COLORS.yellow, -0.4);
  ellipse(ctx, x + s * 0.1, y - s * 0.98, s * 0.08, s * 0.16, COLORS.yellow, 0.4);
  smile(ctx, x, y - s * 0.05, s * 1.1);
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.13, y + s * 0.02);
  ctx.lineTo(x + s * 0.13, y + s * 0.02);
  ctx.lineTo(x, y + s * 0.2);
  ctx.fill();
}

export function penguin(ctx, x, y, s) {
  ellipse(ctx, x - s * 0.3, y + s * 1.05, s * 0.25, s * 0.12, COLORS.orange);
  ellipse(ctx, x + s * 0.3, y + s * 1.05, s * 0.25, s * 0.12, COLORS.orange);
  ellipse(ctx, x - s * 0.82, y + s * 0.2, s * 0.18, s * 0.5, '#2B3A67', 0.3);
  ellipse(ctx, x + s * 0.82, y + s * 0.2, s * 0.18, s * 0.5, '#2B3A67', -0.3);
  ellipse(ctx, x, y, s * 0.85, s * 1.1, '#2B3A67');
  ellipse(ctx, x, y + s * 0.2, s * 0.6, s * 0.85, '#fff');
  smile(ctx, x, y - s * 0.3, s * 0.95);
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.15, y - s * 0.28);
  ctx.lineTo(x + s * 0.15, y - s * 0.28);
  ctx.lineTo(x, y - s * 0.1);
  ctx.fill();
}

export function rabbit(ctx, x, y, s, t = 0) {
  const wiggle = Math.sin(t * 5) * 0.12;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * s * 0.38, y - s * 0.75);
    ctx.rotate(side * (0.15 + wiggle));
    ellipse(ctx, 0, -s * 0.5, s * 0.22, s * 0.6, '#fff');
    ellipse(ctx, 0, -s * 0.5, s * 0.11, s * 0.45, '#FFC2D1');
    ctx.restore();
  }
  circle(ctx, x, y, s, '#fff');
  ctx.strokeStyle = '#F0E0E6';
  ctx.lineWidth = s * 0.05;
  ctx.stroke();
  smile(ctx, x, y + s * 0.05, s * 1.1);
  ellipse(ctx, x, y + s * 0.02, s * 0.08, s * 0.06, COLORS.pink);
}

export function lion(ctx, x, y, s) {
  const mane = '#E07A1F';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    circle(ctx, x + Math.cos(a) * s * 0.85, y + Math.sin(a) * s * 0.85, s * 0.32, mane);
  }
  circle(ctx, x, y, s * 0.9, mane);
  circle(ctx, x - s * 0.5, y - s * 0.55, s * 0.18, '#FFC94D');
  circle(ctx, x + s * 0.5, y - s * 0.55, s * 0.18, '#FFC94D');
  circle(ctx, x, y, s * 0.7, '#FFC94D');
  ellipse(ctx, x, y + s * 0.28, s * 0.32, s * 0.22, '#FFE3A3');
  smile(ctx, x, y + s * 0.05, s * 0.85);
  ellipse(ctx, x, y + s * 0.13, s * 0.1, s * 0.07, '#8B4513');
}

export function cat(ctx, x, y, s) {
  const fur = '#FFB766';
  for (const side of [-1, 1]) {
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.25, y - s * 0.75);
    ctx.lineTo(x + side * s * 0.8, y - s * 1.05);
    ctx.lineTo(x + side * s * 0.82, y - s * 0.35);
    ctx.fill();
    ctx.fillStyle = '#FFC2D1';
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.4, y - s * 0.72);
    ctx.lineTo(x + side * s * 0.72, y - s * 0.9);
    ctx.lineTo(x + side * s * 0.72, y - s * 0.5);
    ctx.fill();
  }
  ellipse(ctx, x, y, s, s * 0.85, fur);
  smile(ctx, x, y + s * 0.02, s);
  ellipse(ctx, x, y + s * 0.0, s * 0.08, s * 0.06, COLORS.pink);
  ctx.strokeStyle = 'rgba(61,44,46,0.6)';
  ctx.lineWidth = s * 0.03;
  for (const side of [-1, 1]) {
    for (const dy of [-0.05, 0.08]) {
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.45, y + s * (0.1 + dy));
      ctx.lineTo(x + side * s * 0.95, y + s * (0.05 + dy * 2));
      ctx.stroke();
    }
  }
}

export function dog(ctx, x, y, s) {
  ellipse(ctx, x - s * 0.82, y - s * 0.05, s * 0.25, s * 0.55, '#8B5E3C', 0.25);
  ellipse(ctx, x + s * 0.82, y - s * 0.05, s * 0.25, s * 0.55, '#8B5E3C', -0.25);
  ellipse(ctx, x, y, s * 0.85, s * 0.9, '#D9A066');
  ellipse(ctx, x + s * 0.32, y - s * 0.2, s * 0.25, s * 0.22, '#C08552');
  ellipse(ctx, x, y + s * 0.38, s * 0.42, s * 0.3, '#F2D2A9');
  smile(ctx, x, y + s * 0.0, s * 0.95);
  ellipse(ctx, x, y + s * 0.2, s * 0.13, s * 0.09, COLORS.ink);
  ellipse(ctx, x, y + s * 0.45, s * 0.1, s * 0.13, '#FF7A8A');
}

export function duck(ctx, x, y, s) {
  circle(ctx, x, y, s, '#FFF4C2');
  ctx.strokeStyle = '#F2E2A0';
  ctx.lineWidth = s * 0.05;
  ctx.stroke();
  smile(ctx, x, y - s * 0.12, s);
  ellipse(ctx, x, y + s * 0.2, s * 0.42, s * 0.16, COLORS.orange);
  ctx.strokeStyle = '#D9771A';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.36, y + s * 0.2);
  ctx.lineTo(x + s * 0.36, y + s * 0.2);
  ctx.stroke();
  ellipse(ctx, x - s * 0.05, y - s * 0.95, s * 0.08, s * 0.16, '#FFF4C2', -0.3);
}

export function cow(ctx, x, y, s) {
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#E9D8A6';
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.35, y - s * 0.75);
    ctx.quadraticCurveTo(x + side * s * 0.7, y - s * 1.2, x + side * s * 0.55, y - s * 1.25);
    ctx.lineTo(x + side * s * 0.55, y - s * 0.65);
    ctx.fill();
    ellipse(ctx, x + side * s * 0.95, y - s * 0.35, s * 0.28, s * 0.14, '#fff', side * 0.4);
  }
  ellipse(ctx, x, y, s * 0.85, s * 0.95, '#fff');
  ctx.strokeStyle = '#E5E5E5';
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  ellipse(ctx, x - s * 0.42, y - s * 0.45, s * 0.25, s * 0.2, COLORS.ink, 0.4);
  ellipse(ctx, x + s * 0.5, y - s * 0.05, s * 0.18, s * 0.25, COLORS.ink, -0.3);
  ellipse(ctx, x, y + s * 0.5, s * 0.6, s * 0.38, '#FFC2D1');
  ellipse(ctx, x - s * 0.2, y + s * 0.5, s * 0.07, s * 0.1, '#E58FA5');
  ellipse(ctx, x + s * 0.2, y + s * 0.5, s * 0.07, s * 0.1, '#E58FA5');
  smile(ctx, x, y - s * 0.05, s * 0.9);
}

// 동물 소리 찾기 놀이용 정보. sound 는 TTS로 읽는 의성어.
export const ANIMAL_INFO = {
  lion: { draw: lion, name: '사자', sound: '어흥', color: COLORS.orange },
  cat: { draw: cat, name: '고양이', sound: '야옹 야옹', color: COLORS.orange },
  dog: { draw: dog, name: '강아지', sound: '멍멍', color: '#C08552' },
  duck: { draw: duck, name: '오리', sound: '꽥꽥', color: COLORS.yellow },
  cow: { draw: cow, name: '소', sound: '음매', color: COLORS.pink },
  frog: { draw: frog, name: '개구리', sound: '개굴개굴', color: COLORS.green },
};
