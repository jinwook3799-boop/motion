// 이름이 있는 그림 모음(한글 놀이·숨은그림찾기에서 사용).
// draw(ctx, x, y, s, t): (x, y)가 그림 중심, s ≈ 그림 반지름.
import { balloon, drum, star, COLORS } from './draw.js';
import { bear, cat, chick, cow, crab, dog, duck, elephant, frog, gorilla, kangaroo, lion, mole, penguin, rabbit, turtle } from './animals.js';
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
  bear: { name: '곰', draw: bear },
  elephant: { name: '코끼리', draw: (ctx, x, y, s, t) => elephant(ctx, x, y - s * 0.15, s * 0.85, t) },
  crab: { name: '게', draw: (ctx, x, y, s) => crab(ctx, x, y + s * 0.1, s * 0.85) },
  turtle: { name: '거북이', draw: (ctx, x, y, s) => turtle(ctx, x - s * 0.15, y, s * 0.9) },
  kangaroo: { name: '캥거루', draw: (ctx, x, y, s) => kangaroo(ctx, x, y + s * 0.2, s * 0.85) },
  gorilla: { name: '고릴라', draw: gorilla },
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
