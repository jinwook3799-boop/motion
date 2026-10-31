import { HoverButton } from '../engine/HoverButton.js';
import { balloon, drum, star, COLORS, RAINBOW } from '../engine/draw.js';
import { frog, lion, mole, rabbit } from '../engine/animals.js';
import { log, poseKid, train } from '../engine/scenery.js';
import { magnifier, rainbowIcon, trafficLight } from '../engine/icons.js';
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

const ITEMS = [
  { scene: 'balloon', name: '풍선 터뜨리기!', color: COLORS.red, icon: (ctx, r) => balloon(ctx, 0, -r * 0.18, r * 0.42, COLORS.red) },
  { scene: 'whack', name: '두더지 잡기!', color: '#9C6B4A', icon: moleIcon },
  { scene: 'mimic', name: '동물 흉내 내기!', color: COLORS.green, icon: (ctx, r) => frog(ctx, 0, r * 0.05, r * 0.5) },
  { scene: 'traffic', name: '멈춰! 출발! 신호등 놀이!', color: COLORS.orange, icon: (ctx, r) => trafficLight(ctx, 0, 0, r * 0.55, 'green') },
  { scene: 'runner', name: '점프 달리기!', color: COLORS.pink, icon: runnerIcon },
  { scene: 'train', name: '칙칙폭폭 기차!', color: COLORS.red, icon: trainIcon },
  { scene: 'pose', name: '포즈 따라 하기!', color: COLORS.purple, icon: (ctx, r, t) => poseKid(ctx, 0, r * 0.15, r * 0.3, 'hooray', t) },
  { scene: 'stars', name: '하늘 별 따기!', color: '#2B3A67', icon: starsIcon },
  { scene: 'sound', name: '동물 소리 듣고 찾기!', color: COLORS.yellow, icon: (ctx, r) => lion(ctx, 0, 0, r * 0.48) },
  { scene: 'instrument', name: '매직 악기!', color: COLORS.blue, icon: (ctx, r) => drum(ctx, 0, 0, r * 0.55) },
  { scene: 'drawing', name: '무지개 그리기!', color: COLORS.purple, icon: (ctx, r) => rainbowIcon(ctx, r * 0.6) },
  { scene: 'hidden', name: '숨은그림 찾기!', color: COLORS.blue, icon: magnifier },
  { scene: 'math', name: '숫자 놀이!', color: COLORS.orange, icon: textIcon('1+2', COLORS.orange) },
  { scene: 'hangul', name: '한글 놀이!', color: COLORS.green, icon: textIcon('가', COLORS.green) },
  { scene: 'alphabet', name: '알파벳 놀이!', color: COLORS.pink, icon: textIcon('ABC', COLORS.pink) },
];

// 글자 없는 메뉴: 그림 위에 손을 올리면 놀이 이름을 말해 주고, 계속 올려 두면 시작한다.
export class MenuScene {
  constructor(game) {
    this.game = game;
    this.buttons = ITEMS.map(
      (item) =>
        new HoverButton({
          drawIcon: item.icon,
          onActivate: () => this.pick(item.scene),
          onHoverStart: () => speak(item.name),
          ringColor: item.color,
          dwell: 1.5,
        }),
    );
  }

  onResize() {
    const { w, h, zone: z } = this.game;
    const n = this.buttons.length;
    // 가로 화면: 8개까지 2줄, 12개까지 4열, 그보다 많으면 5열 / 세로 화면: 2~3열
    const cols = w >= h ? (n <= 8 ? Math.ceil(n / 2) : n <= 12 ? 4 : 5) : n <= 8 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const cellW = z.w / cols;
    const cellH = z.h / rows;
    const r = Math.min(cellW, cellH) * 0.38;
    this.buttons.forEach((b, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols); // 마지막 줄은 가운데 정렬
      const c = i % cols;
      b.place(z.x + z.w / 2 + (c - (inRow - 1) / 2) * cellW, z.y + cellH * (row + 0.5), r);
    });
  }

  enter() {
    speak('무엇을 하고 놀까요? 손을 그림 위에 올려 보세요!');
  }

  pick(name) {
    sfx.select();
    this.game.goTo(name);
    const { w, h, unit } = this.game;
    this.game.particles.burst(w / 2, h / 2, { count: 40, colors: RAINBOW, speed: unit * 0.9, size: unit * 0.02, shape: 'confetti' });
  }

  onTap(x, y) {
    this.buttons.some((b) => b.tap(x, y));
  }

  update(dt, input) {
    for (const b of this.buttons) b.update(dt, input.pointers);
  }

  draw(ctx) {
    for (const b of this.buttons) b.draw(ctx);
  }
}
