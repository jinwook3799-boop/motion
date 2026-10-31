// 동물 친구 그림. 모두 (ctx, 중심 x, 중심 y, 크기 s, 시간 t) 형식이며 s ≈ 몸 반지름.
import { smile, star as drawStar, COLORS } from './draw.js';

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

export function bear(ctx, x, y, s) {
  const fur = '#9C6B4A';
  circle(ctx, x - s * 0.68, y - s * 0.68, s * 0.3, fur);
  circle(ctx, x + s * 0.68, y - s * 0.68, s * 0.3, fur);
  circle(ctx, x - s * 0.68, y - s * 0.68, s * 0.16, '#E8B796');
  circle(ctx, x + s * 0.68, y - s * 0.68, s * 0.16, '#E8B796');
  circle(ctx, x, y, s * 0.95, fur);
  ellipse(ctx, x, y + s * 0.3, s * 0.42, s * 0.32, '#E8C9A6');
  smile(ctx, x, y + s * 0.05, s * 0.95);
  ellipse(ctx, x, y + s * 0.18, s * 0.13, s * 0.09, COLORS.ink);
}

export function elephant(ctx, x, y, s, t = 0) {
  const skin = '#A9B4C8';
  ellipse(ctx, x - s * 0.85, y - s * 0.05, s * 0.55, s * 0.7, skin, -0.2);
  ellipse(ctx, x + s * 0.85, y - s * 0.05, s * 0.55, s * 0.7, skin, 0.2);
  ellipse(ctx, x - s * 0.85, y - s * 0.05, s * 0.35, s * 0.5, '#F2C6D3', -0.2);
  ellipse(ctx, x + s * 0.85, y - s * 0.05, s * 0.35, s * 0.5, '#F2C6D3', 0.2);
  circle(ctx, x, y, s * 0.78, skin);
  // 코(살랑살랑 흔들린다)
  const sway = Math.sin(t * 3) * s * 0.25;
  ctx.strokeStyle = skin;
  ctx.lineWidth = s * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.15);
  ctx.quadraticCurveTo(x + sway * 0.5, y + s * 0.8, x + s * 0.25 + sway, y + s * 1.05);
  ctx.stroke();
  smile(ctx, x, y - s * 0.12, s * 0.85);
}

export function crab(ctx, x, y, s) {
  const shell = '#FF6B4A';
  ctx.strokeStyle = shell;
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.6, y + s * (0.05 + k * 0.18));
      ctx.lineTo(x + side * s * 1.05, y + s * (0.25 + k * 0.25));
      ctx.stroke();
    }
    // 집게
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.55, y - s * 0.2);
    ctx.lineTo(x + side * s * 0.95, y - s * 0.6);
    ctx.stroke();
    circle(ctx, x + side * s * 1.0, y - s * 0.75, s * 0.28, shell);
    ctx.fillStyle = '#FFF7E0';
    ctx.beginPath();
    ctx.moveTo(x + side * s * 1.0, y - s * 0.75);
    ctx.lineTo(x + side * s * 1.0 + side * s * 0.1, y - s * 1.08);
    ctx.lineTo(x + side * s * 1.0 - side * s * 0.18, y - s * 1.0);
    ctx.fill();
    // 눈자루
    ctx.strokeStyle = shell;
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.25, y - s * 0.4);
    ctx.lineTo(x + side * s * 0.3, y - s * 0.75);
    ctx.stroke();
    circle(ctx, x + side * s * 0.3, y - s * 0.8, s * 0.14, '#fff');
    circle(ctx, x + side * s * 0.3, y - s * 0.8, s * 0.07, COLORS.ink);
  }
  ellipse(ctx, x, y + s * 0.05, s * 0.75, s * 0.55, shell);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  ctx.arc(x, y + s * 0.02, s * 0.2, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.globalAlpha *= 0.7;
  circle(ctx, x - s * 0.42, y + s * 0.1, s * 0.1, COLORS.cheek);
  circle(ctx, x + s * 0.42, y + s * 0.1, s * 0.1, COLORS.cheek);
  ctx.globalAlpha /= 0.7;
}

export function turtle(ctx, x, y, s) {
  const skin = '#8BD17C';
  circle(ctx, x + s * 0.95, y - s * 0.05, s * 0.35, skin);
  circle(ctx, x + s * 1.02, y - s * 0.12, s * 0.06, COLORS.ink);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(x + s * 1.02, y - s * 0.02, s * 0.12, 0.2, Math.PI * 0.8);
  ctx.stroke();
  for (const fx of [-0.55, 0.45]) ellipse(ctx, x + fx * s, y + s * 0.42, s * 0.2, s * 0.14, skin);
  ctx.fillStyle = '#4FA84F';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.3, s * 0.85, s * 0.85, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7BC86C';
  for (const [dx, dy, r] of [[0, -0.2, 0.25], [-0.45, 0.05, 0.18], [0.45, 0.05, 0.18]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#E9C893';
  ctx.fillRect(x - s * 0.88, y + s * 0.26, s * 1.76, s * 0.1);
}

export function kangaroo(ctx, x, y, s) {
  const fur = '#D9A066';
  ellipse(ctx, x - s * 0.35, y - s * 0.85, s * 0.18, s * 0.45, fur, -0.25);
  ellipse(ctx, x + s * 0.35, y - s * 0.85, s * 0.18, s * 0.45, fur, 0.25);
  ellipse(ctx, x - s * 0.35, y - s * 0.85, s * 0.08, s * 0.3, '#F2C6A0', -0.25);
  ellipse(ctx, x + s * 0.35, y - s * 0.85, s * 0.08, s * 0.3, '#F2C6A0', 0.25);
  ellipse(ctx, x, y, s * 0.8, s * 0.9, fur);
  ellipse(ctx, x, y + s * 0.35, s * 0.45, s * 0.35, '#F2D2A9');
  smile(ctx, x, y + s * 0.05, s * 0.95);
  ellipse(ctx, x, y + s * 0.2, s * 0.1, s * 0.07, COLORS.ink);
}

export function gorilla(ctx, x, y, s) {
  const fur = '#4A4A5A';
  circle(ctx, x - s * 0.85, y, s * 0.22, fur);
  circle(ctx, x + s * 0.85, y, s * 0.22, fur);
  circle(ctx, x, y, s * 0.95, fur);
  ctx.fillStyle = '#B8A3A0';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.25, y - s * 0.15, s * 0.32, s * 0.3, 0, 0, Math.PI * 2);
  ctx.ellipse(x + s * 0.25, y - s * 0.15, s * 0.32, s * 0.3, 0, 0, Math.PI * 2);
  ctx.ellipse(x, y + s * 0.3, s * 0.5, s * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, x, y + s * 0.0, s * 0.9);
  ellipse(ctx, x - s * 0.08, y + s * 0.18, s * 0.05, s * 0.04, COLORS.ink);
  ellipse(ctx, x + s * 0.08, y + s * 0.18, s * 0.05, s * 0.04, COLORS.ink);
}

// 두더지. dizzy 면 어지러운 눈과 머리 위를 도는 별.
export function mole(ctx, x, y, s, dizzy = false, t = 0) {
  const fur = '#9C6B4A';
  ellipse(ctx, x, y, s, s * 1.15, fur);
  ellipse(ctx, x, y + s * 0.35, s * 0.62, s * 0.62, '#C99A73');
  ellipse(ctx, x - s * 0.55, y + s * 0.75, s * 0.22, s * 0.14, '#F2B8A0');
  ellipse(ctx, x + s * 0.55, y + s * 0.75, s * 0.22, s * 0.14, '#F2B8A0');

  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = COLORS.ink;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = x + side * s * 0.33;
    const ey = y - s * 0.35;
    if (dizzy) {
      ctx.beginPath();
      ctx.arc(ex, ey, s * 0.1, t * 10, t * 10 + Math.PI * 1.6);
      ctx.stroke();
    } else {
      circle(ctx, ex, ey, s * 0.09, COLORS.ink);
      circle(ctx, ex + s * 0.03, ey - s * 0.03, s * 0.03, '#fff');
    }
  }
  ellipse(ctx, x, y - s * 0.1, s * 0.2, s * 0.14, '#FF8FA3');
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - s * 0.1, y + s * 0.02, s * 0.09, s * 0.13);
  ctx.fillRect(x + s * 0.01, y + s * 0.02, s * 0.09, s * 0.13);
  ctx.globalAlpha *= 0.7;
  circle(ctx, x - s * 0.55, y - s * 0.08, s * 0.12, COLORS.cheek);
  circle(ctx, x + s * 0.55, y - s * 0.08, s * 0.12, COLORS.cheek);
  ctx.globalAlpha /= 0.7;

  if (dizzy) {
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * Math.PI * 2) / 3;
      drawStar(ctx, x + Math.cos(a) * s * 0.75, y - s * 1.25 + Math.sin(a) * s * 0.2, s * 0.16, COLORS.yellow);
    }
  }
}

// 동물 소리 찾기 놀이용 정보. 실제 울음소리는 public/sounds/animals/<id>.mp3,
// sound 는 소리 파일을 못 불러왔을 때 TTS로 대신 읽는 의성어.
export const ANIMAL_INFO = {
  lion: { draw: lion, name: '사자', sound: '어흥', color: COLORS.orange },
  cat: { draw: cat, name: '고양이', sound: '야옹 야옹', color: COLORS.orange },
  dog: { draw: dog, name: '강아지', sound: '멍멍', color: '#C08552' },
  duck: { draw: duck, name: '오리', sound: '꽥꽥', color: COLORS.yellow },
  cow: { draw: cow, name: '소', sound: '음매', color: COLORS.pink },
  frog: { draw: frog, name: '개구리', sound: '개굴개굴', color: COLORS.green },
};
