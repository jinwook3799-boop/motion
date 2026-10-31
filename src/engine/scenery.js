// 신체 놀이용 그림: 통나무, 날아오는 새, 기차, 자세를 보여 주는 친구
import { roundRect, smile, COLORS } from './draw.js';

export function log(ctx, x, y, s) {
  ctx.fillStyle = '#A0693F';
  roundRect(ctx, x - s * 1.2, y - s * 0.45, s * 2.4, s * 0.9, s * 0.4);
  ctx.fill();
  ctx.strokeStyle = '#7A4E2D';
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y - s * 0.15);
  ctx.lineTo(x + s * 0.5, y - s * 0.15);
  ctx.moveTo(x - s * 0.3, y + s * 0.15);
  ctx.lineTo(x + s * 0.7, y + s * 0.15);
  ctx.stroke();
  ctx.fillStyle = '#E9C893';
  ctx.beginPath();
  ctx.ellipse(x - s * 1.15, y, s * 0.3, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, x - s * 1.15, y, s * 0.45);
}

// 왼쪽으로 날아오는 새
export function flyingBird(ctx, x, y, s, t = 0) {
  const flap = Math.sin(t * 14);
  ctx.fillStyle = '#5FA8FF';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.1, y - s * 0.2 - flap * s * 0.35, s * 0.55, s * 0.22, -0.5 - flap * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.blue;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.8, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.75, y - s * 0.1);
  ctx.lineTo(x - s * 1.15, y + s * 0.02);
  ctx.lineTo(x - s * 0.75, y + s * 0.15);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - s * 0.38, y - s * 0.15, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(x - s * 0.42, y - s * 0.15, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function wheel(ctx, x, y, r, rot) {
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C9C9D6';
  ctx.lineWidth = r * 0.18;
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.7);
    ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
    ctx.stroke();
  }
}

const CAR_COLORS = [COLORS.blue, COLORS.yellow, COLORS.green];

// 오른쪽으로 달리는 기차. (x, y) = 기관차 앞쪽 아래(레일 위).
// passengers: 객차에 태울 그림 함수 목록 (ctx, x, y, s) → 객차마다 2명씩
export function train(ctx, x, y, s, rot, passengers = []) {
  // 객차(뒤쪽부터)
  for (let c = CAR_COLORS.length - 1; c >= 0; c--) {
    const right = x - s * 3.1 - c * s * 2.5;
    const left = right - s * 2.2;
    for (let k = 0; k < 2; k++) {
      const p = passengers[c * 2 + k];
      if (p) p(ctx, left + s * (0.6 + k * 1.0), y - s * 1.25, s * 0.42);
    }
    ctx.fillStyle = CAR_COLORS[c];
    roundRect(ctx, left, y - s * 1.2, s * 2.2, s * 0.85, s * 0.15);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(left + s * 0.15, y - s * 1.05, s * 1.9, s * 0.12);
    wheel(ctx, left + s * 0.5, y - s * 0.25, s * 0.25, rot);
    wheel(ctx, left + s * 1.7, y - s * 0.25, s * 0.25, rot);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(right, y - s * 0.55);
    ctx.lineTo(right + s * 0.3, y - s * 0.55);
    ctx.stroke();
  }
  // 기관차
  const left = x - s * 2.8;
  ctx.fillStyle = COLORS.red;
  roundRect(ctx, left, y - s * 2.1, s * 1.1, s * 1.85, s * 0.15);
  ctx.fill();
  ctx.fillStyle = '#CDE7FF';
  roundRect(ctx, left + s * 0.2, y - s * 1.9, s * 0.7, s * 0.55, s * 0.1);
  ctx.fill();
  ctx.fillStyle = COLORS.red;
  roundRect(ctx, left + s * 1.0, y - s * 1.3, s * 1.8, s * 1.05, s * 0.45);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x - s * 0.75, y - s * 1.85, s * 0.35, s * 0.6);
  roundRect(ctx, x - s * 0.88, y - s * 2.0, s * 0.6, s * 0.2, s * 0.08);
  ctx.fill();
  smile(ctx, x - s * 0.9, y - s * 0.85, s * 0.9);
  wheel(ctx, left + s * 0.5, y - s * 0.3, s * 0.3, rot);
  wheel(ctx, left + s * 1.5, y - s * 0.3, s * 0.3, rot);
  wheel(ctx, left + s * 2.35, y - s * 0.3, s * 0.3, rot);
}

// 따라 할 자세. 손 위치(몸 중심 기준, s 배)와 다리 모양을 정의한다.
export const POSE_SHAPES = {
  hooray: { hands: [[-0.75, -1.9], [0.75, -1.9]] },
  airplane: { hands: [[-1.5, -0.45], [1.5, -0.45]] },
  oneHand: { hands: [[-0.75, 0.35], [0.7, -1.95]] },
  heart: { hands: [[-0.12, -1.75], [0.12, -1.75]], elbows: [[-0.9, -1.2], [0.9, -1.2]] },
  star: { hands: [[-1.35, -1.55], [1.35, -1.55]], legsApart: true },
  flamingo: { hands: [[-1.4, -0.5], [1.4, -0.5]], legUp: true },
};

export function poseKid(ctx, x, y, s, shapeId, t = 0) {
  const shape = POSE_SHAPES[shapeId];
  const color = COLORS.orange;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 3) * s * 0.04);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.28;
  // 다리
  const spread = shape.legsApart ? 0.55 : 0.22;
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, s * 0.5);
  ctx.lineTo(-s * spread, s * 1.45);
  if (shape.legUp) {
    ctx.moveTo(s * 0.2, s * 0.5);
    ctx.lineTo(s * 0.65, s * 0.75);
    ctx.lineTo(s * 0.45, s * 1.15);
  } else {
    ctx.moveTo(s * 0.2, s * 0.5);
    ctx.lineTo(s * spread, s * 1.45);
  }
  ctx.stroke();
  // 팔
  shape.hands.forEach(([hx, hy], i) => {
    const sx = (i === 0 ? -1 : 1) * s * 0.42;
    ctx.beginPath();
    ctx.moveTo(sx, -s * 0.45);
    if (shape.elbows) ctx.lineTo(shape.elbows[i][0] * s, shape.elbows[i][1] * s);
    ctx.lineTo(hx * s, hy * s);
    ctx.stroke();
    ctx.fillStyle = '#FFD6A5';
    ctx.beginPath();
    ctx.arc(hx * s, hy * s, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
  });
  // 몸통과 머리
  ctx.fillStyle = color;
  roundRect(ctx, -s * 0.5, -s * 0.6, s, s * 1.2, s * 0.4);
  ctx.fill();
  ctx.fillStyle = '#FFD6A5';
  ctx.beginPath();
  ctx.arc(0, -s * 1.05, s * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7A4E2D';
  ctx.beginPath();
  ctx.arc(0, -s * 1.15, s * 0.5, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  smile(ctx, 0, -s * 1.0, s * 0.62);
  ctx.restore();
}
