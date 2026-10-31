import { HoverButton } from '../engine/HoverButton.js';
import { balloon, drum, COLORS, RAINBOW } from '../engine/draw.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

// 글자 없는 메뉴: 큰 그림 위에 손을 올려 두면 놀이가 시작된다.
export class MenuScene {
  constructor(game) {
    this.game = game;
    this.buttons = [
      new HoverButton({
        drawIcon: (ctx, r) => balloon(ctx, 0, -r * 0.18, r * 0.42, COLORS.red),
        onActivate: () => this.pick('balloon'),
        ringColor: COLORS.red,
      }),
      new HoverButton({
        drawIcon: (ctx, r) => drum(ctx, 0, 0, r * 0.55),
        onActivate: () => this.pick('instrument'),
        ringColor: COLORS.blue,
      }),
    ];
  }

  onResize() {
    const { w, h, unit } = this.game;
    const r = Math.min(unit * 0.22, w * 0.14);
    this.buttons[0].place(w * 0.32, h * 0.52, r);
    this.buttons[1].place(w * 0.68, h * 0.52, r);
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
