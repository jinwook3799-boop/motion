import { childSilhouette, COLORS, RAINBOW } from '../engine/draw.js';
import { P, visible } from '../engine/pose.js';
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

// ---- 함께 놀이(아이 두 명) ----

export const PLAYER_COLORS = [COLORS.blue, COLORS.pink];

// 화면 왼쪽 아이부터
export const leftToRight = (people) => [...people].sort((a, b) => a.center.x - b.center.x);

// 손목·검지 끝 중 보이는 점들
export const handPoints = (pose) => [P.lWrist, P.rWrist, P.lIndex, P.rIndex].map((i) => pose[i]).filter((p) => visible(p));

// 친구가 한 명 더 필요할 때: 아이 실루엣 두 개(두 번째는 깜빡임)
export function drawNeedTwo(ctx, game, count) {
  const { w, h, unit, time } = game;
  const s = unit * 0.12;
  const y = h * 0.55;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(w / 2 - s * 2.6, y - s * 1.3, s * 5.2, s * 2.3, s * 0.4);
  ctx.fill();
  childSilhouette(ctx, w / 2 - s * 1.1, y, s, count >= 1 ? PLAYER_COLORS[0] : 'rgba(61,44,46,0.25)');
  ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(time * 3));
  childSilhouette(ctx, w / 2 + s * 1.1, y, s, PLAYER_COLORS[1]);
  ctx.restore();
}
