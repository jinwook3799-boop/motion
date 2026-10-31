import { RAINBOW } from '../engine/draw.js';
import { sfx } from '../engine/audio.js';

// 축하 폭죽 한 번(놀이 영역 위쪽 무작위 위치)
export function firework(game) {
  const { zone: z, unit } = game;
  game.particles.burst(z.x + Math.random() * z.w, z.y + Math.random() * z.h * 0.55, {
    count: 36,
    colors: RAINBOW,
    speed: unit * 0.55,
    size: unit * 0.012,
    gravity: 150,
    life: 1.2,
  });
  sfx.pop();
}
