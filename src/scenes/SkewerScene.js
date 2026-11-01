import { HoverButton } from '../engine/HoverButton.js';
import { progressRing, smile, star, COLORS, RAINBOW } from '../engine/draw.js';
import { speakerIcon, starGauge } from '../engine/icons.js';
import { THINGS } from '../engine/things.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { josa, pick, shuffle } from '../engine/util.js';
import { firework } from './common.js';

// ---- 판정·진행 기준값(추정값 — 실제 아이와 해 보며 조정) ----
const GOAL = 8; // 한 판에 만드는 꼬치 수(다 만들면 큰 축하)
const GRAB_DWELL = 0.7; // 접시 위에 손바닥을 이만큼(초) 올려 두면 음식을 잡는다
const GRAB_PAD = 0.25; // 접시 반지름에 더해 주는 잡기 여유(반지름 배) — 유아용으로 넉넉하게
const REGRAB_COOL = 0.8; // 잡거나 놓은 뒤 같은 손이 다시 잡기까지 쉬는 시간(초)
const CARRY_LOST = 0.6; // 음식을 든 손이 이만큼(초) 안 보이면 음식은 접시로 돌아간다
const CARRY_FOLLOW = 18; // 든 음식이 손을 따라가는 빠르기(클수록 바짝 따라감)
const DROP_PAD = 0.07; // 꼬치 '놓는 곳' 둘레 여유(화면 짧은 변 배)
const HINT_AFTER = 5; // 이만큼(초) 다음 칸을 못 채우면 음성 + 맞는 접시 흔들기로 알려 준다
// 쉬운 방법(대체 방식): 이만큼(초) 지나도 못 꽂으면, 그 꼬치는 '잡기만 하면 꼬치로 저절로 날아가는' 방식으로 바꾼다.
// 손을 든 채 꼬치까지 옮기기 어려운 어린 아이도 끝까지 해낼 수 있게 하기 위함.
const AUTO_FLY_AFTER = 8;
const AUTO_FLY_AGAIN = 4; // 바로 전 꼬치에서 쉬운 방법을 썼으면 다음 꼬치에서는 이만큼(초) 뒤에 바로 바꾼다
const REPEAT_AFTER = 12; // 그 뒤로도 못 꽂으면 이만큼(초)마다 다음 음식을 다시 알려 준다
const START_GRACE = 3; // 새 꼬치 순서를 읽어 주는 동안은 기다림 시간에서 빼 준다(초)
const WRONG_VOICE_GAP = 2.5; // "이번엔 ○○예요!" 를 너무 자주 말하지 않게(초)
const NAME_VOICE_GAP = 1.5; // 접시에 손을 올렸을 때 이름 말하기 간격(초)
const FLY_TIME = 0.5; // 쉬운 방법·터치로 음식이 꼬치까지 날아가는 시간(초)
const BACK_TIME = 0.6; // 틀린 음식이 접시로 통통 돌아가는 시간(초)
const SLIDE_TIME = 0.3; // 맞는 음식이 꼬치 칸으로 쏙 미끄러지는 시간(초)
const EAT_START = 1.1; // 꼬치 완성 뒤 동물 친구가 먹기 시작하는 때(초)
const EAT_EACH = 0.35; // 한 조각 먹는 간격(초)
const CELEBRATE_TIME = 4.5; // 여덟 개 다 만든 뒤 축하 시간(초)
const VEGGIE_CHANCE = 0.3; // 과일꼬치 대신 떡·야채꼬치가 나올 확률
// 단계: 3개 → 4개 → 5개 반복 무늬(AB·ABC)
const LEVELS = [{ n: 3 }, { n: 4 }, { n: 5, pattern: true }];
// 한 판(꼬치 8개) 안에서 꼬치마다의 단계. 두 번째 판부터는 마지막 줄을 쓴다.
const ROUND_PLANS = [
  [0, 0, 0, 1, 1, 1, 2, 2],
  [1, 1, 1, 2, 2, 2, 2, 2],
];
const MAX_PLATES = 6;
// 접시 자리(놀이 영역 비율). 왼쪽·오른쪽 번갈아 채운다. 왼쪽 가운데는 집 버튼 자리라 비워 둔다.
const PLATE_SPOTS = [
  [0.1, 0.25],
  [0.9, 0.27],
  [0.1, 0.78],
  [0.9, 0.5],
  [0.9, 0.73],
  [0.25, 0.88],
];
const FRIENDS = ['bear', 'cat', 'dog', 'lion', 'chick', 'rabbit', 'frog', 'penguin'];
const YUM_LINES = ['냠냠! 맛있어요!', '냠냠! 고마워요!', '우와, 맛있는 꼬치! 냠냠!'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;

// ---- 음식 그림(플랫 벡터, 웃는 얼굴). (x, y) 가운데, r ≈ 반지름 ----
function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function shine(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.11, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function strawberry(ctx, x, y, r) {
  ctx.fillStyle = '#FF4D6D';
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.95);
  ctx.bezierCurveTo(x - r * 1.15, y + r * 0.3, x - r * 0.95, y - r * 0.8, x, y - r * 0.62);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 0.8, x + r * 1.15, y + r * 0.3, x, y + r * 0.95);
  ctx.fill();
  ctx.fillStyle = '#FFE36E';
  for (const [sx, sy] of [[-0.5, -0.28], [0.5, -0.28], [-0.32, 0.42], [0.32, 0.42], [0, 0.68], [-0.62, 0.1], [0.62, 0.1]]) {
    ctx.beginPath();
    ctx.ellipse(x + sx * r, y + sy * r, r * 0.045, r * 0.075, sx * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  star(ctx, x, y - r * 0.66, r * 0.36, '#3BB273');
  smile(ctx, x, y - r * 0.02, r * 0.7);
}

function banana(ctx, x, y, r) {
  const cy = y - r * 0.85;
  const R = r * 0.98;
  const a0 = Math.PI * 0.2;
  const a1 = Math.PI * 0.8;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#E6B400';
  ctx.lineWidth = r * 0.72;
  ctx.beginPath();
  ctx.arc(x, cy, R, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = '#FFE066';
  ctx.lineWidth = r * 0.58;
  ctx.beginPath();
  ctx.arc(x, cy, R, a0, a1);
  ctx.stroke();
  ctx.restore();
  for (const a of [a0, a1]) circle(ctx, x + Math.cos(a) * R, cy + Math.sin(a) * R, r * 0.1, '#7A5230');
  smile(ctx, x, y + r * 0.13, r * 0.5);
}

function grape(ctx, x, y, r) {
  ctx.strokeStyle = '#7A4E2D';
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.7);
  ctx.lineTo(x + r * 0.08, y - r * 1.0);
  ctx.stroke();
  ctx.fillStyle = '#5BC85B';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.34, y - r * 0.9, r * 0.25, r * 0.12, -0.4, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x, y + r * 0.05, r * 0.82, '#8E44AD');
  shine(ctx, x - r * 0.42, y - r * 0.28, r);
  smile(ctx, x, y + r * 0.1, r * 0.72);
}

function tangerine(ctx, x, y, r) {
  circle(ctx, x, y + r * 0.05, r * 0.86, '#FF9F1C');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (const [sx, sy] of [[-0.55, 0.4], [0.55, 0.4], [-0.62, -0.1], [0.6, -0.15], [0, 0.72]]) {
    ctx.beginPath();
    ctx.arc(x + sx * r, y + sy * r, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  circle(ctx, x, y - r * 0.78, r * 0.08, '#6B8E23');
  ctx.fillStyle = '#3BB273';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.28, y - r * 0.86, r * 0.28, r * 0.13, -0.35, 0, Math.PI * 2);
  ctx.fill();
  shine(ctx, x - r * 0.45, y - r * 0.3, r);
  smile(ctx, x, y + r * 0.1, r * 0.72);
}

function kiwi(ctx, x, y, r) {
  circle(ctx, x, y, r * 0.9, '#8B5E3C');
  circle(ctx, x, y, r * 0.77, '#8BC34A');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
    ctx.lineTo(x + Math.cos(a + 0.12) * r * 0.75, y + Math.sin(a + 0.12) * r * 0.75);
    ctx.fill();
  }
  ctx.fillStyle = '#2B2B2B';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 + 0.26;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, r * 0.07, r * 0.035, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#F1F8C8';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.24, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
}

function blueberry(ctx, x, y, r) {
  circle(ctx, x, y + r * 0.05, r * 0.8, '#3D5A98');
  star(ctx, x, y - r * 0.5, r * 0.22, '#26386A');
  shine(ctx, x - r * 0.42, y - r * 0.2, r);
  smile(ctx, x, y + r * 0.2, r * 0.6);
}

function pineapple(ctx, x, y, r) {
  ctx.fillStyle = '#3BB273';
  for (const [dx, h] of [[-0.3, 0.42], [0, 0.6], [0.3, 0.42]]) {
    ctx.beginPath();
    ctx.moveTo(x + (dx - 0.16) * r, y - r * 0.4);
    ctx.lineTo(x + dx * 1.3 * r, y - r * (0.4 + h));
    ctx.lineTo(x + (dx + 0.16) * r, y - r * 0.4);
    ctx.fill();
  }
  ctx.save();
  ctx.fillStyle = '#FFD23F';
  ctx.beginPath();
  ctx.roundRect(x - r * 0.72, y - r * 0.5, r * 1.44, r * 1.32, r * 0.3);
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(244,161,0,0.55)';
  ctx.lineWidth = r * 0.06;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.38 - r, y - r);
    ctx.lineTo(x + i * r * 0.38 + r, y + r);
    ctx.moveTo(x + i * r * 0.38 + r, y - r);
    ctx.lineTo(x + i * r * 0.38 - r, y + r);
    ctx.stroke();
  }
  ctx.restore();
  smile(ctx, x, y + r * 0.15, r * 0.7);
}

function tteok(ctx, x, y, r) {
  ctx.fillStyle = '#FFF8EC';
  ctx.strokeStyle = '#E9D3B0';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.roundRect(x - r * 0.52, y - r * 0.85, r * 1.04, r * 1.7, r * 0.45);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(233,211,176,0.6)';
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.55, r * 0.34, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  smile(ctx, x, y + r * 0.12, r * 0.62);
}

function sausage(ctx, x, y, r) {
  ctx.fillStyle = '#C8553D';
  ctx.beginPath();
  ctx.roundRect(x - r * 0.95, y - r * 0.5, r * 1.9, r * 1.0, r * 0.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,200,0.6)';
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = 'round';
  for (const dx of [-0.62, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(x + (dx - 0.1) * r, y - r * 0.3);
    ctx.lineTo(x + (dx + 0.1) * r, y + r * 0.3);
    ctx.stroke();
  }
  shine(ctx, x - r * 0.4, y - r * 0.2, r * 0.8);
  smile(ctx, x, y + r * 0.02, r * 0.62);
}

function paprika(ctx, x, y, r) {
  ctx.strokeStyle = '#2E7D32';
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.55);
  ctx.quadraticCurveTo(x, y - r * 0.9, x + r * 0.25, y - r * 0.95);
  ctx.stroke();
  ctx.fillStyle = '#FFC300';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y + r * 0.12, r * 0.48, r * 0.72, 0.15, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.38, y + r * 0.12, r * 0.48, r * 0.72, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.15, r * 0.45, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x, y - r * 0.52, r * 0.16, '#3BB273');
  shine(ctx, x - r * 0.55, y - r * 0.05, r);
  smile(ctx, x, y + r * 0.18, r * 0.65);
}

function mushroom(ctx, x, y, r) {
  ctx.fillStyle = '#FFF1D6';
  ctx.beginPath();
  ctx.roundRect(x - r * 0.32, y - r * 0.15, r * 0.64, r * 1.0, r * 0.25);
  ctx.fill();
  ctx.fillStyle = '#A0522D';
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.12, r * 0.92, r * 0.78, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (const [sx, sy, sr] of [[-0.45, -0.45, 0.12], [0.2, -0.62, 0.1], [0.55, -0.3, 0.09]]) circle(ctx, x + sx * r, y + sy * r, sr * r, ctx.fillStyle);
  smile(ctx, x, y + r * 0.42, r * 0.48);
}

function tomato(ctx, x, y, r) {
  circle(ctx, x, y + r * 0.06, r * 0.82, '#E63946');
  star(ctx, x, y - r * 0.66, r * 0.34, '#2E9E4F');
  shine(ctx, x - r * 0.42, y - r * 0.22, r);
  smile(ctx, x, y + r * 0.14, r * 0.72);
}

const FOODS = {
  strawberry: { name: '딸기', draw: strawberry, color: '#FF4D6D' },
  banana: { name: '바나나', draw: banana, color: '#FFE066' },
  grape: { name: '포도', draw: grape, color: '#8E44AD' },
  tangerine: { name: '귤', draw: tangerine, color: '#FF9F1C' },
  kiwi: { name: '키위', draw: kiwi, color: '#8BC34A' },
  blueberry: { name: '블루베리', draw: blueberry, color: '#3D5A98' },
  pineapple: { name: '파인애플', draw: pineapple, color: '#FFD23F' },
  tteok: { name: '떡', draw: tteok, color: '#FFF8EC' },
  sausage: { name: '소시지', draw: sausage, color: '#C8553D' },
  paprika: { name: '파프리카', draw: paprika, color: '#FFC300' },
  mushroom: { name: '버섯', draw: mushroom, color: '#A0522D' },
  tomato: { name: '방울토마토', draw: tomato, color: '#E63946' },
};
const FRUITS = ['strawberry', 'banana', 'grape', 'tangerine', 'kiwi', 'blueberry', 'pineapple'];
const SAVORY = ['tteok', 'sausage', 'paprika', 'mushroom', 'tomato'];
// 서로 헷갈리기 쉬운 짝은 한 꼬치(접시 포함)에 같이 내지 않는다.
const LOOKALIKE = [['grape', 'blueberry'], ['strawberry', 'tomato']];
const looksLike = (a, b) => LOOKALIKE.some(([p, q]) => (a === p && b === q) || (a === q && b === p));

function drawFood(ctx, type, x, y, r) {
  ctx.save();
  FOODS[type].draw(ctx, x, y, r);
  ctx.restore();
}

// pool 에서 k 개를 고른다(이미 고른 것과 헷갈리는 것은 되도록 피함).
function pickTypes(pool, k, taken = []) {
  const out = [];
  const rest = shuffle(pool.filter((t) => !taken.includes(t)));
  for (const t of rest) {
    if (out.length >= k) break;
    if ([...taken, ...out].some((o) => looksLike(o, t))) continue;
    out.push(t);
  }
  for (const t of rest) if (out.length < k && !out.includes(t)) out.push(t);
  return out;
}

// 꼬치 모양 배치: 왼쪽이 손잡이, 오른쪽이 뾰족한 끝. 첫 번째 음식이 손잡이 쪽(왼쪽부터 순서대로)
function stickLayout(cx, cy, n, r, maxW) {
  const sp = Math.min(r * 2.2, maxW / (n + 1.4));
  const ir = Math.min(r, sp / 2.2);
  const first = cx - ((n - 1) * sp) / 2 + sp * 0.12;
  const slots = Array.from({ length: n }, (_, i) => ({ x: first + i * sp, y: cy }));
  return { slots, r: ir, sp, y: cy, x0: first - sp * 0.95, x1: first + (n - 1) * sp + sp * 0.75 };
}

// 나무 꼬치(손잡이에 빨간 테이프)
function drawStick(ctx, L, glow = 0) {
  const th = Math.max(3, L.r * 0.17);
  ctx.save();
  if (glow > 0) {
    ctx.strokeStyle = `rgba(255,210,63,${0.5 * glow})`;
    ctx.lineWidth = th * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y);
    ctx.lineTo(L.x1, L.y);
    ctx.stroke();
  }
  ctx.fillStyle = '#E9C893';
  ctx.strokeStyle = '#C9A26B';
  ctx.lineWidth = th * 0.3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(L.x0, L.y - th / 2);
  ctx.lineTo(L.x1 - th * 2.4, L.y - th / 2);
  ctx.lineTo(L.x1, L.y);
  ctx.lineTo(L.x1 - th * 2.4, L.y + th / 2);
  ctx.lineTo(L.x0, L.y + th / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.roundRect(L.x0 - th * 0.3, L.y - th * 1.1, L.sp * 0.42, th * 2.2, th * 0.7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(L.x0 + L.sp * 0.12, L.y - th * 1.1, L.sp * 0.07, th * 2.2);
  ctx.restore();
}

// 빈 칸: 점선 동그라미. 다음 칸이면 노랗게 반짝
function drawSlot(ctx, x, y, r, next, t) {
  ctx.save();
  const k = next ? 1 + Math.sin(t * 6) * 0.08 : 1;
  ctx.fillStyle = next ? 'rgba(255,210,63,0.35)' : 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([r * 0.22, r * 0.16]);
  ctx.lineWidth = r * (next ? 0.12 : 0.07);
  ctx.strokeStyle = next ? COLORS.orange : 'rgba(61,44,46,0.3)';
  ctx.stroke();
  ctx.restore();
}

function drawPlate(ctx, x, y, r, rim) {
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.1, r, r * 0.96, 0, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x, y, r, rim);
  circle(ctx, x, y, r * 0.8, '#fff');
  ctx.strokeStyle = 'rgba(61,44,46,0.06)';
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();
}

// 손바닥 표시(잡는 데 쓰는 곳)
function palmCursor(ctx, x, y, s) {
  ctx.save();
  ctx.globalAlpha = 0.8; // 접시 위 음식이 가려지지 않게 살짝 투명하게
  circle(ctx, x, y, s * 1.3, 'rgba(255,255,255,0.6)');
  star(ctx, x, y, s, COLORS.yellow, '#fff');
  ctx.restore();
}

const PLATE_RIMS = ['#FFD6E0', '#CDE7FF', '#D7F5E9', '#FFE8C2', '#E8DAFF', '#FFF3B0'];

// 꼬치 만들기: 위의 '보기 꼬치' 카드와 똑같은 순서로 음식을 꽂는다(순서·규칙 찾기).
// 접시에 손바닥을 잠시 올려 음식을 잡고(그 손에 붙어 다님), 아래 꼬치로 가져가면 쏙 꽂힌다.
// 오래(AUTO_FLY_AFTER) 못 꽂으면 그 꼬치는 '잡기만 하면 저절로 날아가는' 쉬운 방법으로 바뀐다.
export class SkewerScene {
  hideCursor = true; // 손가락 끝 대신 잡는 데 쓰는 손바닥을 직접 그린다
  hideTrail = true;

  constructor(game) {
    this.game = game;
    this.order = [];
    this.plates = [];
    this.slots = [];
    this.replay = new HoverButton({
      drawIcon: speakerIcon,
      onActivate: () => {
        sfx.select();
        this.sayOrder();
      },
      ringColor: COLORS.purple,
      dwell: 1.2,
    });
  }

  onResize() {
    this.layout();
  }

  layout() {
    const { unit, zone: z } = this.game;
    if (!z) return;
    this.pr = Math.min(unit * 0.075, z.w * 0.085, z.h * 0.095);
    this.plates.forEach((p, i) => {
      const [fx, fy] = PLATE_SPOTS[i];
      p.x = z.x + z.w * fx;
      p.y = z.y + z.h * fy;
      p.r = this.pr;
    });
    const n = this.order.length || 3;
    this.card = stickLayout(z.x + z.w / 2, z.y + z.h * 0.15, n, Math.min(unit * 0.04, z.h * 0.055), z.w * 0.5);
    this.stick = stickLayout(z.x + z.w / 2, z.y + z.h * 0.56, n, Math.min(unit * 0.06, z.h * 0.08), z.w * 0.58);
    const rr = unit * 0.05;
    this.replay.place(this.card.x1 + this.card.r * 1.6 + rr, this.card.y, rr);
    const pad = unit * DROP_PAD;
    const S = this.stick;
    this.drop = { x0: S.x0 - pad, x1: S.x1 + pad, y0: S.y - S.r * 1.4 - pad, y1: S.y + S.r * 1.4 + pad };
    this.friendPos = { x: z.x + z.w / 2, y: z.y + z.h * 0.83 };
    this.friendS = Math.min(unit * 0.085, z.h * 0.11);
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.round = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.hands = new Map(); // 포인터 key → { plate, prog, cool, seen }
    this.carried = []; // 손에 들린 음식 { type, key, x, y, plate, seen }
    this.flyers = []; // 날아가는 음식 { type, x0, y0, x1, y1, t, dur, kind: 'auto' | 'back', plate }
    this.cursors = [];
    this.lastVoice = -99;
    this.busyUntil = 0;
    this.lastWrongVoice = -99;
    this.needEasy = false;
    this.stats = { skewers: 0, wrong: 0, easy: 0 }; // 발달 기록용(메모리에만)
    this.newSkewer();
    this.state = 'intro';
    this.after(speak('위에 있는 꼬치랑 똑같은 순서로 꼬치를 만들어요!'), () => this.startPlay());
  }

  exit() {
    this.active = false;
  }

  after(promise, fn) {
    const token = ++this.token;
    promise.then(() => {
      if (this.active && this.token === token) fn();
    });
  }

  // 말하기. important 가 아니면(접시 이름 등) 중요한 말을 끊지 않고, 너무 자주 말하지 않는다.
  say(text, important = true) {
    const now = this.game.time;
    if (!important && (now < this.busyUntil || now - this.lastVoice < NAME_VOICE_GAP)) return;
    this.lastVoice = now;
    if (important) this.busyUntil = now + 0.8 + text.length * 0.12;
    speak(text);
  }

  get nextType() {
    return this.order[this.slots.length];
  }

  newSkewer() {
    const plan = ROUND_PLANS[Math.min(this.round, ROUND_PLANS.length - 1)];
    const lv = LEVELS[plan[Math.min(this.score, plan.length - 1)]];
    const pool = Math.random() < VEGGIE_CHANCE ? SAVORY : FRUITS;
    let kinds;
    if (lv.pattern) {
      const k = Math.random() < 0.5 ? 2 : 3; // AB 또는 ABC 반복 무늬
      kinds = pickTypes(pool, k);
      this.order = Array.from({ length: lv.n }, (_, i) => kinds[i % k]);
    } else {
      kinds = pickTypes(pool, lv.n);
      this.order = kinds;
    }
    const extra = Math.min(2, MAX_PLATES - kinds.length, pool.length - kinds.length);
    const others = pickTypes(pool, extra, kinds);
    this.plates = shuffle([...kinds, ...others]).map((type) => ({ type, x: 0, y: 0, r: 0, prog: 0, bump: 0 }));
    this.slots = []; // 꽂힌 음식 { type, fx, fy, t }
    this.carried = [];
    this.flyers = [];
    this.hands.clear();
    this.eaten = 0;
    this.layout();
  }

  startPlay() {
    this.state = 'play';
    this.easy = false;
    this.slotT = -START_GRACE;
    this.hinted = false;
    this.nextRepeat = REPEAT_AFTER;
    this.hintT = 0;
    sfx.whoosh();
    this.sayOrder();
  }

  sayOrder() {
    if (this.state !== 'play') return;
    const names = this.order.map((t) => FOODS[t].name).join(', ');
    this.say(`${names} 순서로 꽂아요!`);
  }

  onTap(x, y) {
    if (this.state !== 'play') return;
    if (this.replay.tap(x, y)) return;
    const p = { x, y };
    const plate = this.plates.find((pl) => dist(p, pl) < pl.r * (1 + GRAB_PAD));
    if (!plate) return;
    // 터치·클릭은 바로 꼬치로 날려 보낸다(보호자 조작·PC 테스트용)
    sfx.peek();
    plate.bump = 1;
    this.flyTo(plate.type, plate.x, plate.y, plate);
    this.hands.set('mouse', { plate, prog: 0, cool: 1.2, seen: this.game.time });
  }

  update(dt, input) {
    const now = this.game.time;
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    for (const p of this.plates) {
      p.prog = 0;
      p.bump = Math.max(0, p.bump - dt * 3);
    }
    for (const s of this.slots) s.t += dt;
    this.hintT = Math.max(0, (this.hintT ?? 0) - dt);

    // 잡는 손: 손바닥(손마다 id 가 있어 두 아이의 손 네 개가 섞이지 않음) + 마우스·터치
    const grabbers = input.pointers.filter((p) => p.part === 'palm' || p.key === 'mouse');
    this.cursors = grabbers;
    this.replay.update(dt, this.state === 'play' ? input.pointers : []);

    if (this.state === 'play') this.updatePlay(dt, grabbers);
    else this.dropAll();

    // 날아가는 음식
    for (const f of [...this.flyers]) {
      f.t += dt;
      if (f.t < f.dur) continue;
      f.done = true;
      if (f.kind === 'auto') this.judge(f.type, f.x1, f.y1, f.plate);
      else if (f.plate) f.plate.bump = 0.7;
    }
    this.flyers = this.flyers.filter((f) => !f.done);

    if (this.state === 'yum') this.updateYum(dt);
    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.round++;
        this.score = 0;
        this.pulse.fill(0);
        this.newSkewer();
        this.startPlay();
      }
    }
    for (const [key, h] of this.hands) {
      h.cool = Math.max(0, h.cool - dt);
      if (now - h.seen > 1) this.hands.delete(key);
    }
  }

  updatePlay(dt, grabbers) {
    const now = this.game.time;
    for (const p of grabbers) {
      let h = this.hands.get(p.key);
      if (!h) {
        h = { plate: null, prog: 0, cool: 0 };
        this.hands.set(p.key, h);
      }
      h.seen = now;
      const carry = this.carried.find((c) => c.key === p.key);
      if (carry) {
        // 든 음식은 그 손을 따라간다. 꼬치 근처에 오면 꽂아 본다.
        const k = Math.min(1, dt * CARRY_FOLLOW);
        carry.x += (p.x - carry.x) * k;
        carry.y += (p.y - carry.y) * k;
        carry.seen = now;
        if (this.inDrop(carry) || this.inDrop(p)) {
          this.carried.splice(this.carried.indexOf(carry), 1);
          h.cool = REGRAB_COOL;
          h.prog = 0;
          this.judge(carry.type, carry.x, carry.y, carry.plate);
        }
        continue;
      }
      // 가장 가까운 접시 위에 손을 올려 두면 잡기 진행
      let best = null;
      let bd = Infinity;
      for (const pl of this.plates) {
        const d = dist(p, pl);
        if (d < pl.r * (1 + GRAB_PAD) && d < bd) {
          best = pl;
          bd = d;
        }
      }
      if (best && best !== h.plate) {
        h.plate = best;
        h.prog = 0;
        this.say(FOODS[best.type].name, false);
      }
      if (best && h.cool === 0) {
        h.prog += dt / GRAB_DWELL;
        if (h.prog >= 1) {
          h.prog = 0;
          h.cool = REGRAB_COOL;
          this.grab(p, best);
        }
      } else {
        h.prog = Math.max(0, h.prog - dt * 1.5);
      }
      if (h.plate) h.plate.prog = Math.max(h.plate.prog, h.prog);
    }
    // 손이 사라지면 든 음식은 접시로 돌아간다(혼내지 않고 조용히)
    for (const c of [...this.carried]) {
      if (now - c.seen > CARRY_LOST) {
        this.carried.splice(this.carried.indexOf(c), 1);
        this.sendBack(c.type, c.x, c.y, c.plate, false);
      }
    }

    if (this.state !== 'play') return; // 방금 꼬치를 완성했으면 아래 안내는 건너뛴다

    // 기다림 시간에 따라 단계적으로 도와준다: 음성 힌트 → 쉬운 방법 → 반복 안내
    this.slotT += dt;
    const name = FOODS[this.nextType].name;
    if (!this.hinted && this.slotT > HINT_AFTER && !this.carried.length) {
      this.hinted = true;
      this.hintT = 2;
      this.say(`${josa(name, '을', '를')} 찾아서 꼬치에 꽂아요!`);
    }
    if (!this.easy && this.slotT > (this.needEasy ? AUTO_FLY_AGAIN : AUTO_FLY_AFTER)) {
      this.easy = true;
      this.stats.easy++;
      this.hintT = 2.5;
      this.say(`${name} 위에 손을 올리고 기다려요. 꼬치로 쏙 날아가요!`);
      // 들고 있던 음식도 바로 날아가게
      for (const c of this.carried) this.flyTo(c.type, c.x, c.y, c.plate);
      this.carried = [];
    }
    if (this.slotT > this.nextRepeat) {
      this.nextRepeat += REPEAT_AFTER;
      this.hintT = 2;
      this.say(`이번엔 ${josa(name, '이에요', '예요')}!`);
    }
  }

  inDrop(p) {
    const d = this.drop;
    return p.x >= d.x0 && p.x <= d.x1 && p.y >= d.y0 && p.y <= d.y1;
  }

  grab(p, plate) {
    sfx.peek();
    plate.bump = 1;
    this.game.particles.ring(plate.x, plate.y, { color: '#fff', size: plate.r * 0.9 });
    if (this.easy) this.flyTo(plate.type, plate.x, plate.y, plate);
    else this.carried.push({ type: plate.type, key: p.key, x: plate.x, y: plate.y, plate, seen: this.game.time });
  }

  // 꼬치의 다음 칸으로 날아가서 판정(쉬운 방법·터치)
  flyTo(type, x, y, plate) {
    const s = this.stick.slots[Math.min(this.slots.length, this.order.length - 1)];
    this.flyers.push({ type, x0: x, y0: y, x1: s.x, y1: s.y, t: 0, dur: FLY_TIME, kind: 'auto', plate, arc: this.game.unit * 0.12 });
  }

  sendBack(type, x, y, plate, wrong) {
    const p = plate ?? this.plates.find((pl) => pl.type === type);
    if (!p) return;
    this.flyers.push({ type, x0: x, y0: y, x1: p.x, y1: p.y, t: 0, dur: BACK_TIME, kind: 'back', plate: p, arc: this.game.unit * (wrong ? 0.15 : 0.05), wrong });
  }

  judge(type, x, y, plate) {
    const i = this.slots.length;
    if (this.state !== 'play' || i >= this.order.length) return this.sendBack(type, x, y, plate, false);
    const { particles, unit } = this.game;
    if (type === this.order[i]) {
      // 맞으면 쏙! 꽂히고 이름을 말해 준다
      this.slots.push({ type, fx: x, fy: y, t: 0 });
      this.slotT = 0;
      this.hinted = false;
      this.nextRepeat = REPEAT_AFTER;
      this.hintT = 0;
      sfx.bloop();
      sfx.sparkle(0.05);
      const s = this.stick.slots[i];
      particles.burst(s.x, s.y, { count: 22, colors: [COLORS.yellow, '#fff', COLORS.pink], speed: unit * 0.45, size: unit * 0.014, shape: 'star', gravity: 150, life: 0.8 });
      particles.ring(s.x, s.y, { color: COLORS.yellow, size: this.stick.r });
      if (this.slots.length === this.order.length) this.complete();
      else this.say(`${FOODS[type].name}!`);
    } else {
      // 틀리면 혼내지 않고 접시로 통통 돌려보내며 다음 음식을 부드럽게 알려 준다
      this.stats.wrong++;
      sfx.oops();
      this.sendBack(type, x, y, plate, true);
      this.hintT = 1.8;
      const now = this.game.time;
      if (now - this.lastWrongVoice > WRONG_VOICE_GAP) {
        this.lastWrongVoice = now;
        this.say(`이번엔 ${josa(FOODS[this.order[i]].name, '이에요', '예요')}!`);
      }
    }
  }

  // 남은 음식(손에 든 것)은 조용히 접시로
  dropAll() {
    for (const c of this.carried) this.sendBack(c.type, c.x, c.y, c.plate, false);
    this.carried = [];
  }

  complete() {
    this.state = 'yum';
    this.stateT = 0;
    this.starGiven = false;
    this.friend = pick(FRIENDS);
    this.needEasy = this.easy;
    this.stats.skewers++;
    this.dropAll();
    sfx.success();
    const { particles, unit } = this.game;
    for (const s of this.stick.slots) particles.burst(s.x, s.y, { count: 14, colors: RAINBOW, speed: unit * 0.5, size: unit * 0.014, shape: 'confetti' });
    this.say(pick(['꼬치 완성! 똑같아요!', '와, 똑같이 만들었어요!']));
  }

  updateYum(dt) {
    const prev = this.stateT;
    this.stateT += dt;
    const t = this.stateT;
    const { particles, unit } = this.game;
    const n = this.order.length;
    if (prev < EAT_START - 0.1 && t >= EAT_START - 0.1) this.say(pick(YUM_LINES));
    // 꼬치 끝(오른쪽)부터 한 조각씩 냠
    for (let j = 0; j < n; j++) {
      const at = EAT_START + j * EAT_EACH;
      if (prev < at + 0.25 && t >= at + 0.25) {
        sfx.pop();
        const F = this.friendPos;
        particles.burst(F.x, F.y - this.friendS * 0.2, { count: 10, colors: [FOODS[this.order[n - 1 - j]].color, '#fff'], speed: unit * 0.3, size: unit * 0.01, gravity: 300, life: 0.6 });
        this.eaten = j + 1;
      }
    }
    const end = EAT_START + n * EAT_EACH + 0.5;
    if (!this.starGiven && t >= end) {
      this.starGiven = true;
      this.pulse[this.score] = 1;
      this.score++;
      sfx.sparkle();
    }
    if (t >= end + 0.6) {
      if (this.score >= GOAL) {
        this.state = 'celebrate';
        this.stateT = CELEBRATE_TIME;
        this.fireT = 0;
        sfx.fanfare();
        this.say('꼬치 여덟 개 완성! 정말 잘했어요!');
      } else {
        this.newSkewer();
        this.startPlay();
      }
    }
  }

  // ---- 그리기 ----

  draw(ctx) {
    const { time, unit } = this.game;
    const playing = this.state === 'play';
    this.drawCard(ctx, time);

    // 접시들
    const next = this.nextType;
    for (const p of this.plates) {
      ctx.save();
      if (!playing && this.state !== 'intro') ctx.globalAlpha = 0.45;
      const hint = playing && p.type === next && (this.hintT > 0 || this.easy);
      const wob = hint ? Math.sin(time * 14) * 0.12 : 0;
      const k = 1 + p.bump * 0.12 + (hint ? 0.05 : 0);
      ctx.translate(p.x, p.y);
      ctx.scale(k, k);
      drawPlate(ctx, 0, 0, p.r, PLATE_RIMS[this.plates.indexOf(p) % PLATE_RIMS.length]);
      ctx.rotate(wob);
      drawFood(ctx, p.type, 0, 0, p.r * 0.6);
      ctx.restore();
      if (playing) progressRing(ctx, p.x, p.y, p.r, p.prog, COLORS.yellow);
    }

    // 아이의 꼬치
    const S = this.stick;
    const carrying = this.carried.length > 0;
    if (playing && carrying) {
      // 음식을 들고 있으면 놓는 곳을 살짝 반짝여 알려 준다
      const d = this.drop;
      ctx.save();
      ctx.fillStyle = `rgba(255,210,63,${0.12 + 0.08 * Math.sin(time * 6)})`;
      ctx.beginPath();
      ctx.roundRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, unit * 0.04);
      ctx.fill();
      ctx.restore();
    }
    const yum = this.state === 'yum';
    drawStick(ctx, S, yum ? clamp01(1 - this.stateT / EAT_START) : 0);
    const n = this.order.length;
    S.slots.forEach((s, i) => {
      if (i >= this.slots.length) return drawSlot(ctx, s.x, s.y, S.r, playing && i === this.slots.length, time);
      const it = this.slots[i];
      const k = easeOut(clamp01(it.t / SLIDE_TIME));
      let x = lerp(it.fx, s.x, k);
      let y = lerp(it.fy, s.y, k);
      let r = S.r * (1 + (1 - k) * 0.15);
      if (yum) {
        // 동물 친구가 꼬치 끝부터 먹는다: 입으로 쏙 들어가며 작아진다
        const j = n - 1 - i;
        const e = clamp01((this.stateT - (EAT_START + j * EAT_EACH)) / 0.25);
        if (e >= 1) return;
        const F = this.friendPos;
        x = lerp(x, F.x, ease(e));
        y = lerp(y, F.y - this.friendS * 0.1, ease(e));
        r *= 1 - e * 0.8;
        const sp = clamp01(this.stateT / EAT_START);
        if (sp < 1) y -= Math.sin(sp * Math.PI) * unit * 0.015;
      }
      drawFood(ctx, it.type, x, y, r);
    });

    if (yum) this.drawFriend(ctx);

    // 날아가는 음식
    for (const f of this.flyers) {
      const k = ease(clamp01(f.t / f.dur));
      const x = lerp(f.x0, f.x1, k);
      const y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * f.arc;
      ctx.save();
      ctx.translate(x, y);
      if (f.wrong) ctx.rotate(Math.sin(f.t * 30) * 0.25 * (1 - k));
      drawFood(ctx, f.type, 0, 0, (f.kind === 'auto' ? S.r : this.pr * 0.6) * (1 + Math.sin(k * Math.PI) * 0.15));
      ctx.restore();
    }

    // 손바닥 표시와 손에 든 음식
    const s = unit * 0.028;
    for (const p of this.cursors) {
      if (p.key === 'mouse' && this.game.mouse?.touch) continue;
      palmCursor(ctx, p.x, p.y, s);
    }
    for (const c of this.carried) {
      const r = S.r * 1.05;
      circle(ctx, c.x, c.y, r * 1.15, 'rgba(255,255,255,0.65)');
      drawFood(ctx, c.type, c.x, c.y + Math.sin(time * 8) * r * 0.05, r);
    }

    if (playing) this.replay.draw(ctx);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  // 위쪽 '보기 꼬치' 카드: 다음에 꽂을 음식은 노란 동그라미로 깜빡, 꽂은 것은 작은 별
  drawCard(ctx, time) {
    const C = this.card;
    if (!C) return;
    const padX = C.r * 0.8;
    const h = C.r * 3;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.roundRect(C.x0 - padX, C.y - h / 2 + h * 0.05, C.x1 - C.x0 + padX * 2, h, C.r * 0.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(C.x0 - padX, C.y - h / 2, C.x1 - C.x0 + padX * 2, h, C.r * 0.6);
    ctx.fill();
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineWidth = C.r * 0.12;
    ctx.stroke();
    ctx.restore();
    drawStick(ctx, C);
    const cur = this.state === 'play' ? this.slots.length : -1;
    C.slots.forEach((s, i) => {
      const now = i === cur;
      if (now) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,210,63,0.5)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, C.r * (1.05 + Math.sin(time * 6) * 0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const bob = now ? Math.sin(time * 6) * C.r * 0.08 : 0;
      drawFood(ctx, this.order[i], s.x, s.y + bob, C.r * (now ? 1.08 : 0.92));
      if (i < this.slots.length) star(ctx, s.x + C.r * 0.7, s.y - C.r * 0.75, C.r * 0.3, COLORS.yellow, '#F4A100');
    });
  }

  drawFriend(ctx) {
    const t = this.stateT;
    const F = this.friendPos;
    const s = this.friendS;
    const n = this.order.length;
    const end = EAT_START + n * EAT_EACH + 0.5;
    const rise = ease(clamp01((t - 0.5) / 0.45)) * (1 - ease(clamp01((t - end - 0.1) / 0.4)));
    if (rise <= 0) return;
    // 먹을 때마다 통통 튀는 모습
    const chew = t > EAT_START && t < end - 0.3 ? Math.abs(Math.sin((t - EAT_START) * Math.PI / EAT_EACH)) : 0;
    ctx.save();
    ctx.translate(F.x, F.y + (1 - rise) * s * 0.6);
    ctx.scale(rise * (1 + chew * 0.06), rise * (1 - chew * 0.06));
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2);
    ctx.fill();
    THINGS[this.friend].draw(ctx, 0, 0, s, this.game.time);
    // 냠냠 입
    ctx.fillStyle = '#C0392B';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.32, s * 0.16, s * (0.06 + chew * 0.1), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (t > end - 0.2) {
      for (let i = 0; i < 3; i++) {
        const a = this.game.time * 2 + (i * Math.PI * 2) / 3;
        star(ctx, F.x + Math.cos(a) * s * 1.5, F.y + Math.sin(a) * s * 1.1, s * 0.2, COLORS.yellow, '#fff');
      }
    }
  }
}

// ---- 놀이 설명·메뉴 아이콘 ----
const loop = (t, period) => (t % period) / period;

function demoCursor(ctx, x, y, s) {
  circle(ctx, x, y, s * 0.35, 'rgba(255,255,255,0.8)');
  star(ctx, x, y, s * 0.27, COLORS.yellow, COLORS.orange);
}

const DEMO_ORDER = ['strawberry', 'banana', 'grape'];
const DEMO_PLATES = [
  { type: 'strawberry', x: -5.3, y: -0.6, rim: PLATE_RIMS[0] },
  { type: 'grape', x: -5.3, y: 2.3, rim: PLATE_RIMS[2] },
  { type: 'banana', x: 5.3, y: -0.6, rim: PLATE_RIMS[1] },
  { type: 'kiwi', x: 5.3, y: 2.3, rim: PLATE_RIMS[3] },
];

export const guide = {
  text: '위에 있는 꼬치랑 똑같은 순서로 꽂아요! 음식에 손을 올려 잡고 꼬치로 쏙 가져가요.',
  demo: (ctx, s, t) => {
    const PICK = 2.8;
    const total = PICK * 3 + 2.2;
    const T = t % total;
    const step = Math.min(3, Math.floor(T / PICK));
    const p = step < 3 ? (T - step * PICK) / PICK : 1;
    // 보기 카드
    const card = stickLayout(0, -3.2 * s, 3, s * 0.55, s * 6);
    ctx.fillStyle = '#FFF4D6';
    ctx.beginPath();
    ctx.roundRect(card.x0 - s * 0.5, card.y - s * 0.85, card.x1 - card.x0 + s, s * 1.7, s * 0.4);
    ctx.fill();
    drawStick(ctx, card);
    card.slots.forEach((c, i) => {
      if (i === step) circle(ctx, c.x, c.y, s * 0.62, 'rgba(255,210,63,0.6)');
      drawFood(ctx, DEMO_ORDER[i], c.x, c.y, s * 0.5);
    });
    // 접시
    for (const pl of DEMO_PLATES) {
      drawPlate(ctx, pl.x * s, pl.y * s, s * 0.95, pl.rim);
      drawFood(ctx, pl.type, pl.x * s, pl.y * s, s * 0.58);
    }
    // 아이 꼬치
    const stick = stickLayout(0, s * 1.0, 3, s * 0.8, s * 7);
    drawStick(ctx, stick, step >= 3 ? 0.6 + 0.4 * Math.sin(t * 6) : 0);
    stick.slots.forEach((c, i) => {
      if (i < step) drawFood(ctx, DEMO_ORDER[i], c.x, c.y, stick.r);
      else drawSlot(ctx, c.x, c.y, stick.r, i === step, t);
    });
    if (step >= 3) {
      // 완성! 반짝
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + t;
        star(ctx, Math.cos(a) * s * 3.2, s * 1.0 + Math.sin(a) * s * 1.4, s * 0.25, i % 2 ? '#fff' : COLORS.yellow, COLORS.orange);
      }
      return;
    }
    // 손: 접시로 가서(0~0.25) 기다리고(0.25~0.5) 잡아서 꼬치로 가져감(0.5~0.85) → 쏙(0.85~)
    const plate = DEMO_PLATES.find((pl) => pl.type === DEMO_ORDER[step]);
    const px = plate.x * s;
    const py = plate.y * s;
    const slot = stick.slots[step];
    const rest = { x: px * 0.4, y: s * 3.6 };
    let cx;
    let cy;
    if (p < 0.25) {
      const k = ease(p / 0.25);
      cx = lerp(rest.x, px, k);
      cy = lerp(rest.y, py, k);
    } else if (p < 0.5) {
      cx = px;
      cy = py;
      progressRing(ctx, px, py, s * 0.95, (p - 0.25) / 0.25, COLORS.yellow);
    } else {
      const k = ease(clamp01((p - 0.5) / 0.35));
      cx = lerp(px, slot.x, k);
      cy = lerp(py, slot.y, k);
    }
    demoCursor(ctx, cx, cy, s);
    if (p >= 0.5 && p < 0.85) drawFood(ctx, DEMO_ORDER[step], cx, cy - s * 0.1, stick.r * 1.05);
    if (p >= 0.85) {
      drawFood(ctx, DEMO_ORDER[step], slot.x, slot.y, stick.r);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const d = s * (0.9 + (p - 0.85) * 4);
        star(ctx, slot.x + Math.cos(a) * d, slot.y + Math.sin(a) * d, s * 0.16, i % 2 ? '#fff' : COLORS.yellow, COLORS.orange);
      }
    }
  },
};

// 메뉴 아이콘: 비스듬한 과일 꼬치
export function menuIcon(ctx, r, t = 0) {
  ctx.save();
  ctx.rotate(-0.55);
  const L = stickLayout(0, 0, 3, r * 0.33, r * 2.15);
  drawStick(ctx, L);
  ['strawberry', 'banana', 'grape'].forEach((type, i) => {
    const s = L.slots[i];
    const bob = Math.sin(t * 4 - i * 0.9) * r * 0.03;
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    ctx.rotate(0.55);
    drawFood(ctx, type, 0, 0, L.r);
    ctx.restore();
  });
  ctx.restore();
}
