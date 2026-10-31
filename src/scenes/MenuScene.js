import { HoverButton } from '../engine/HoverButton.js';
import { balloon, drum, COLORS, RAINBOW } from '../engine/draw.js';
import { frog, lion } from '../engine/animals.js';
import { rainbowIcon, trafficLight } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const ITEMS = [
  { scene: 'balloon', name: '풍선 터뜨리기!', color: COLORS.red, icon: (ctx, r) => balloon(ctx, 0, -r * 0.18, r * 0.42, COLORS.red) },
  { scene: 'mimic', name: '동물 흉내 내기!', color: COLORS.green, icon: (ctx, r) => frog(ctx, 0, r * 0.05, r * 0.5) },
  { scene: 'traffic', name: '멈춰! 출발! 신호등 놀이!', color: COLORS.orange, icon: (ctx, r) => trafficLight(ctx, 0, 0, r * 0.55, 'green') },
  { scene: 'sound', name: '동물 소리 듣고 찾기!', color: COLORS.yellow, icon: (ctx, r) => lion(ctx, 0, 0, r * 0.48) },
  { scene: 'instrument', name: '매직 악기!', color: COLORS.blue, icon: (ctx, r) => drum(ctx, 0, 0, r * 0.55) },
  { scene: 'drawing', name: '무지개 그리기!', color: COLORS.purple, icon: (ctx, r) => rainbowIcon(ctx, r * 0.6) },
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
    const [cols, rows] = w >= h ? [3, 2] : [2, 3];
    const cellW = z.w / cols;
    const cellH = z.h / rows;
    const r = Math.min(cellW, cellH) * 0.38;
    this.buttons.forEach((b, i) => {
      const c = i % cols;
      const row = Math.floor(i / cols);
      b.place(z.x + cellW * (c + 0.5), z.y + cellH * (row + 0.5), r);
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
