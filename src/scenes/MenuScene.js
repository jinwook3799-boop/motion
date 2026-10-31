import { HoverButton } from '../engine/HoverButton.js';
import { balloon, drum, star, COLORS, RAINBOW } from '../engine/draw.js';
import { frog, lion, mole, rabbit } from '../engine/animals.js';
import { campfire, log, poseKid, train, waterGun } from '../engine/scenery.js';
import { heart, homeIcon, magnifier, rainbowIcon, trafficLight } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

// 구멍에서 쏙 나온 두더지
function moleIcon(ctx, r) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-r, -r, r * 2, r * 1.3);
  ctx.ellipse(0, r * 0.3, r * 0.55, r * 0.17, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#5A3E2B';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.3, r * 0.55, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  mole(ctx, 0, -r * 0.05, r * 0.4);
  ctx.restore();
  ctx.strokeStyle = '#8B5E3C';
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.3, r * 0.6, r * 0.21, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
}

// 학습 놀이 아이콘: 색 동그라미 안의 글자
const textIcon = (text, color) => (ctx, r) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  const size = r * (text.length <= 1 ? 0.8 : text.length <= 2 ? 0.6 : 0.45);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${size}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.06);
};

function runnerIcon(ctx, r) {
  log(ctx, 0, r * 0.45, r * 0.22);
  rabbit(ctx, 0, -r * 0.2, r * 0.26);
}

// 원 안에 기관차 앞부분만 보이게
function trainIcon(ctx, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  train(ctx, r * 0.75, r * 0.45, r * 0.38, 0);
  ctx.restore();
}

function starsIcon(ctx, r) {
  ctx.fillStyle = '#2B3A67';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  star(ctx, 0, 0, r * 0.42, COLORS.yellow, '#fff');
  star(ctx, -r * 0.45, -r * 0.35, r * 0.1, '#fff');
  star(ctx, r * 0.45, r * 0.3, r * 0.08, '#fff');
}

// 손바닥
function handIcon(ctx, r) {
  ctx.fillStyle = '#FFD6A5';
  ctx.strokeStyle = '#E9A86B';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.roundRect(-r * 0.33, -r * 0.05, r * 0.66, r * 0.6, r * 0.2);
  for (const [dx, len] of [[-0.25, 0.45], [-0.08, 0.55], [0.09, 0.52], [0.26, 0.42]]) {
    ctx.roundRect(dx * r - r * 0.075, -r * 0.05 - len * r, r * 0.15, len * r + r * 0.15, r * 0.075);
  }
  ctx.fill();
  ctx.save();
  ctx.translate(-r * 0.38, r * 0.15);
  ctx.rotate(-0.7);
  ctx.beginPath();
  ctx.roundRect(-r * 0.075, -r * 0.3, r * 0.15, r * 0.4, r * 0.075);
  ctx.fill();
  ctx.restore();
}

// 두 친구
function togetherIcon(ctx, r, t) {
  poseKid(ctx, -r * 0.3, r * 0.2, r * 0.2, 'airplane', t);
  poseKid(ctx, r * 0.3, r * 0.2, r * 0.2, 'airplane', t + 1);
  heart(ctx, 0, -r * 0.45, r * 0.16, COLORS.pink);
}

function rallyIcon(ctx, r) {
  const colors = [COLORS.red, '#fff', COLORS.blue, '#fff', COLORS.yellow, '#fff'];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.5, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(61,44,46,0.25)';
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function highFiveIcon(ctx, r) {
  star(ctx, 0, -r * 0.1, r * 0.45, COLORS.yellow, '#F4A100');
  for (const [dx, c] of [[-0.3, COLORS.blue], [0.3, COLORS.pink]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(dx * r, r * 0.5, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function mirrorIcon(ctx, r, t) {
  poseKid(ctx, -r * 0.3, r * 0.2, r * 0.2, 'oneHand', t);
  ctx.save();
  ctx.translate(r * 0.3, 0);
  ctx.scale(-1, 1);
  poseKid(ctx, 0, r * 0.2, r * 0.2, 'oneHand', t);
  ctx.restore();
  ctx.strokeStyle = 'rgba(61,44,46,0.3)';
  ctx.lineWidth = r * 0.03;
  ctx.setLineDash([r * 0.06, r * 0.05]);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.6);
  ctx.lineTo(0, r * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);
}

// 물총과 모닥불
function waterIcon(ctx, r, t) {
  campfire(ctx, r * 0.28, -r * 0.05, r * 0.28, t);
  waterGun(ctx, -r * 0.42, r * 0.3, r * 0.3, -0.5, COLORS.blue);
  ctx.fillStyle = '#4CC9F0';
  for (let i = 0; i < 3; i++) {
    const k = ((t * 1.5 + i / 3) % 1);
    ctx.beginPath();
    ctx.arc(-r * 0.1 + k * r * 0.35, r * 0.12 - k * r * 0.2, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

function teamIcon(ctx, r) {
  balloon(ctx, -r * 0.25, -r * 0.2, r * 0.25, COLORS.blue);
  balloon(ctx, r * 0.25, -r * 0.2, r * 0.25, COLORS.red);
}

const GAMES = {
  balloon: { name: '풍선 터뜨리기!', color: COLORS.red, icon: (ctx, r) => balloon(ctx, 0, -r * 0.18, r * 0.42, COLORS.red) },
  whack: { name: '두더지 잡기!', color: '#9C6B4A', icon: moleIcon },
  sound: { name: '동물 소리 듣고 찾기!', color: COLORS.yellow, icon: (ctx, r) => lion(ctx, 0, 0, r * 0.48) },
  instrument: { name: '매직 악기!', color: COLORS.blue, icon: (ctx, r) => drum(ctx, 0, 0, r * 0.55) },
  drawing: { name: '무지개 그리기!', color: COLORS.purple, icon: (ctx, r) => rainbowIcon(ctx, r * 0.6) },
  hidden: { name: '숨은그림 찾기!', color: COLORS.blue, icon: magnifier },
  mimic: { name: '동물 흉내 내기!', color: COLORS.green, icon: (ctx, r) => frog(ctx, 0, r * 0.05, r * 0.5) },
  traffic: { name: '멈춰! 출발! 신호등 놀이!', color: COLORS.orange, icon: (ctx, r) => trafficLight(ctx, 0, 0, r * 0.55, 'green') },
  runner: { name: '점프 달리기!', color: COLORS.pink, icon: runnerIcon },
  train: { name: '칙칙폭폭 기차!', color: COLORS.red, icon: trainIcon },
  pose: { name: '포즈 따라 하기!', color: COLORS.purple, icon: (ctx, r, t) => poseKid(ctx, 0, r * 0.15, r * 0.3, 'hooray', t) },
  stars: { name: '하늘 별 따기!', color: '#2B3A67', icon: starsIcon },
  highfive: { name: '하이파이브 별!', color: COLORS.yellow, icon: highFiveIcon },
  rally: { name: '공 주고받기!', color: COLORS.red, icon: rallyIcon },
  mirror: { name: '거울 놀이!', color: COLORS.purple, icon: mirrorIcon },
  team: { name: '색깔 팀 풍선!', color: COLORS.blue, icon: teamIcon },
  water: { name: '물총 소방관!', color: '#4CC9F0', icon: waterIcon },
  math: { name: '숫자 놀이!', color: COLORS.orange, icon: textIcon('1+2', COLORS.orange) },
  hangul: { name: '한글 놀이!', color: COLORS.green, icon: textIcon('가', COLORS.green) },
  alphabet: { name: '알파벳 놀이!', color: COLORS.pink, icon: textIcon('ABC', COLORS.pink) },
};

// 놀이가 많아 아이콘이 너무 작아지지 않도록 분류 → 놀이 두 단계로 고른다.
const CATEGORIES = [
  { name: '손 놀이!', color: COLORS.red, icon: handIcon, games: ['balloon', 'whack', 'sound', 'instrument', 'drawing', 'hidden'] },
  { name: '몸 놀이!', color: COLORS.green, icon: (ctx, r, t) => poseKid(ctx, 0, r * 0.12, r * 0.3, 'star', t), games: ['mimic', 'traffic', 'runner', 'train', 'pose', 'stars'] },
  { name: '함께 놀이!', color: COLORS.pink, icon: togetherIcon, games: ['highfive', 'rally', 'mirror', 'team', 'water'] },
  { name: '배움 놀이!', color: COLORS.blue, icon: textIcon('가', COLORS.blue), games: ['math', 'hangul', 'alphabet'] },
];

// 글자 없는 메뉴: 그림 위에 손을 올리면 이름을 말해 주고, 계속 올려 두면 고른다.
// 놀이를 마치고 돌아오면 마지막으로 고른 분류의 놀이 목록을 보여 준다.
export class MenuScene {
  constructor(game) {
    this.game = game;
    this.category = null;
    this.buttons = [];
    this.back = new HoverButton({
      drawIcon: homeIcon,
      onActivate: () => this.openCategory(null),
      onHoverStart: () => speak('처음으로 갈까요?'),
      ringColor: COLORS.orange,
      dwell: 1.5,
    });
  }

  build() {
    const entries = this.category
      ? this.category.games.map((id) => ({ ...GAMES[id], onActivate: () => this.pick(id) }))
      : CATEGORIES.map((c) => ({ ...c, onActivate: () => this.openCategory(c) }));
    this.buttons = entries.map(
      (e) =>
        new HoverButton({
          drawIcon: e.icon,
          onActivate: e.onActivate,
          onHoverStart: () => speak(e.name),
          ringColor: e.color,
          dwell: 1.5,
        }),
    );
    this.onResize();
  }

  onResize() {
    const { w, h, unit, zone: z } = this.game;
    const n = this.buttons.length;
    if (!n) return;
    const cols = w >= h ? Math.ceil(n / 2) : 2;
    const rows = Math.ceil(n / cols);
    const cellW = z.w / cols;
    const cellH = z.h / rows;
    const r = Math.min(cellW, cellH) * 0.36;
    this.buttons.forEach((b, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols); // 마지막 줄은 가운데 정렬
      const c = i % cols;
      b.place(z.x + z.w / 2 + (c - (inRow - 1) / 2) * cellW, z.y + cellH * (row + 0.5), r);
    });
    const br = unit * 0.065;
    this.back.place(z.x + br * 1.1, z.y + br * 1.1, br);
  }

  enter() {
    this.build();
    speak(this.category ? `${this.category.name} 무엇을 할까요?` : '무엇을 하고 놀까요? 손을 그림 위에 올려 보세요!');
  }

  openCategory(category) {
    sfx.select();
    this.category = category;
    this.build();
    speak(category ? `${category.name} 무엇을 할까요?` : '무엇을 하고 놀까요?');
  }

  pick(id) {
    sfx.select();
    this.game.goTo(id);
    const { w, h, unit } = this.game;
    this.game.particles.burst(w / 2, h / 2, { count: 40, colors: RAINBOW, speed: unit * 0.9, size: unit * 0.02, shape: 'confetti' });
  }

  onTap(x, y) {
    if (this.category && this.back.tap(x, y)) return;
    this.buttons.some((b) => b.tap(x, y));
  }

  update(dt, input) {
    for (const b of this.buttons) b.update(dt, input.pointers);
    if (this.category) this.back.update(dt, input.pointers);
  }

  draw(ctx) {
    for (const b of this.buttons) b.draw(ctx);
    if (this.category) this.back.draw(ctx);
  }
}
