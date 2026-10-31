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

// 따라 할 자세. 손 위치(몸 중심 기준, s 배)와 팔꿈치·다리 모양을 정의한다.
// front: 손이 얼굴·가슴 앞에 오는 자세(팔을 몸 위에 그린다)
export const POSE_SHAPES = {
  hooray: { hands: [[-0.75, -1.9], [0.75, -1.9]] },
  airplane: { hands: [[-1.5, -0.45], [1.5, -0.45]] },
  oneHand: { hands: [[-0.75, 0.35], [0.7, -1.95]] },
  heart: { hands: [[-0.12, -1.75], [0.12, -1.75]], elbows: [[-0.9, -1.2], [0.9, -1.2]] },
  star: { hands: [[-1.35, -1.55], [1.35, -1.55]], legsApart: true },
  flamingo: { hands: [[-1.4, -0.5], [1.4, -0.5]], legUp: true },
  muscle: { hands: [[-1.05, -1.3], [1.05, -1.3]], elbows: [[-1.2, -0.5], [1.2, -0.5]] },
  bunny: { hands: [[-0.32, -1.85], [0.32, -1.85]], elbows: [[-0.85, -1.25], [0.85, -1.25]] },
  superhero: { hands: [[-0.48, 0.38], [0.48, 0.38]], elbows: [[-1.0, -0.05], [1.0, -0.05]], legsApart: true },
  cheeks: { hands: [[-0.45, -0.92], [0.45, -0.92]], elbows: [[-0.62, 0.05], [0.62, 0.05]], front: true },
  peekaboo: { hands: [[-0.16, -1.12], [0.16, -1.12]], elbows: [[-0.6, -0.05], [0.6, -0.05]], front: true },
  teapot: { hands: [[-0.48, 0.38], [1.45, -0.85]], elbows: [[-1.0, -0.05], null] },
  cross: { hands: [[0.38, -0.3], [-0.38, -0.3]], elbows: [[-0.55, 0.1], [0.55, 0.1]], front: true },
};

export function poseKid(ctx, x, y, s, shapeId, t = 0) {
  kid(ctx, x, y + Math.sin(t * 3) * s * 0.04, s, POSE_SHAPES[shapeId]);
}

// 사람 모양 친구. shape: { hands, elbows?, legUp?, legsApart?, front?, color? }
// 놀이 설명 화면에서도 손 위치를 바꿔 가며 움직이는 데 쓴다.
export function kid(ctx, x, y, s, shape) {
  const color = shape.color ?? COLORS.orange;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.28;
  // 다리 (legUp: 1 = 오른다리, -1 = 왼다리)
  const spread = shape.legsApart ? 0.55 : 0.22;
  const legUp = shape.legUp === true ? 1 : shape.legUp ?? 0;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.2, s * 0.5);
    if (legUp === side) {
      ctx.lineTo(side * s * 0.65, s * 0.75);
      ctx.lineTo(side * s * 0.45, s * 1.15);
    } else {
      ctx.lineTo(side * s * spread, s * 1.45);
    }
    ctx.stroke();
  }

  const arms = () =>
    shape.hands.forEach(([hx, hy], i) => {
      const sx = (i === 0 ? -1 : 1) * s * 0.42;
      const elbow = shape.elbows?.[i];
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx, -s * 0.45);
      if (elbow) ctx.lineTo(elbow[0] * s, elbow[1] * s);
      ctx.lineTo(hx * s, hy * s);
      ctx.stroke();
      ctx.fillStyle = '#FFD6A5';
      ctx.beginPath();
      ctx.arc(hx * s, hy * s, s * 0.17, 0, Math.PI * 2);
      ctx.fill();
    });

  if (!shape.front) arms();
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
  if (shape.front) arms();
  ctx.restore();
}

// 모닥불: 장작 위에서 일렁이는 불꽃. k(0~1) = 불의 크기(물을 맞을수록 작아진다)
export function campfire(ctx, x, y, r, t, k = 1) {
  ctx.save();
  ctx.translate(x, y);
  // 장작
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = '#8B5E3C';
  for (const a of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(-Math.cos(a) * r * 0.75, r * 0.55 + Math.sin(a) * r * 0.25);
    ctx.lineTo(Math.cos(a) * r * 0.75, r * 0.55 - Math.sin(a) * r * 0.25);
    ctx.stroke();
  }
  // 불꽃 세 겹(빨강 → 주황 → 노랑), 시간에 따라 일렁인다
  const layers = [
    ['#FF595E', 1],
    ['#FF924C', 0.72],
    ['#FFD23F', 0.45],
  ];
  for (const [color, size] of layers) {
    const h = r * 1.5 * size * k * (1 + Math.sin(t * 9 + size * 5) * 0.07);
    const w = r * 0.75 * size * Math.max(0.35, k);
    const sway = Math.sin(t * 6 + size * 3) * w * 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.45);
    ctx.bezierCurveTo(-w * 1.3, r * 0.4, -w * 0.7, r * 0.45 - h * 0.6, sway, r * 0.45 - h);
    ctx.bezierCurveTo(w * 0.7, r * 0.45 - h * 0.6, w * 1.3, r * 0.4, 0, r * 0.45);
    ctx.fill();
  }
  ctx.restore();
}

// 장난감 물총. (x, y) = 손잡이(손) 위치, angle = 쏘는 방향
export function waterGun(ctx, x, y, s, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) ctx.scale(1, -1); // 왼쪽을 겨눠도 손잡이가 아래로 오게
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-s * 0.35, -s * 0.32, s * 1.15, s * 0.42, s * 0.18); // 몸통
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-s * 0.3, -s * 0.05, s * 0.28, s * 0.55, s * 0.1); // 손잡이
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(s * 0.75, -s * 0.2, s * 0.35, s * 0.18, s * 0.06); // 총구
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(s * 0.15, -s * 0.38, s * 0.16, 0, Math.PI * 2); // 물통
  ctx.fill();
  ctx.restore();
}
