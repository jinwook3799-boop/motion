// 이름이 있는 그림 모음(한글 놀이·숨은그림찾기에서 사용).
// draw(ctx, x, y, s, t): (x, y)가 그림 중심, s ≈ 그림 반지름.
import { balloon, drum, star, COLORS } from './draw.js';
import { cat, chick, cow, dog, duck, frog, lion, mole, penguin, rabbit } from './animals.js';
import { apple, fish, heart, rainbowIcon, trafficLight } from './icons.js';

export const THINGS = {
  lion: { name: '사자', draw: lion },
  cat: { name: '고양이', draw: cat },
  dog: { name: '강아지', draw: dog },
  duck: { name: '오리', draw: duck },
  cow: { name: '소', draw: cow },
  frog: { name: '개구리', draw: frog },
  chick: { name: '병아리', draw: chick },
  penguin: { name: '펭귄', draw: (ctx, x, y, s) => penguin(ctx, x, y - s * 0.05, s * 0.85) },
  rabbit: { name: '토끼', draw: (ctx, x, y, s, t) => rabbit(ctx, x, y + s * 0.3, s * 0.75, t) },
  mole: { name: '두더지', draw: (ctx, x, y, s) => mole(ctx, x, y, s * 0.85) },
  balloon: { name: '풍선', draw: (ctx, x, y, s) => balloon(ctx, x, y - s * 0.55, s * 0.6, COLORS.red) },
  drum: { name: '북', draw: (ctx, x, y, s) => drum(ctx, x, y, s * 0.95) },
  star: { name: '별', draw: (ctx, x, y, s) => star(ctx, x, y, s, COLORS.yellow, '#F4A100') },
  apple: { name: '사과', draw: apple },
  fish: { name: '물고기', draw: (ctx, x, y, s) => fish(ctx, x, y, s * 0.85, COLORS.orange) },
  heart: { name: '하트', draw: (ctx, x, y, s) => heart(ctx, x, y, s, COLORS.pink) },
  rainbow: {
    name: '무지개',
    draw: (ctx, x, y, s) => {
      ctx.save();
      ctx.translate(x, y - s * 0.1);
      rainbowIcon(ctx, s);
      ctx.restore();
    },
  },
  trafficLight: { name: '신호등', draw: (ctx, x, y, s) => trafficLight(ctx, x, y, s * 0.48, 'green') },
};
