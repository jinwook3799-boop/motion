// 놀이 설명: 놀이를 시작하기 전에 친구 캐릭터가 하는 방법을 직접 움직여 보여 주고, 음성으로도 설명한다.
// demo(ctx, s, t): 설명 카드 가운데가 (0, 0), s = 캐릭터 크기 단위, t = 경과 시간(초)
import { balloon, drum, progressRing, star, COLORS } from './draw.js';
import { apple, heart, speakerIcon, trafficLight } from './icons.js';
import { frog, lion, mole } from './animals.js';
import { flyingBird, kid, log, POSE_SHAPES } from './scenery.js';

const REST = [[-0.7, 0.4], [0.7, 0.4]];
const UP = [[-0.7, -1.9], [0.7, -1.9]];
const loop = (t, period) => (t % period) / period;
const lerp = (a, b, k) => a + (b - a) * k;
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

// 손을 뻗었다(0→1) 잠시 머물렀다 돌아오는 움직임. hit = 목표에 닿아 있는 동안
function reach(t, period = 2.4) {
  const p = loop(t, period);
  if (p < 0.4) return { k: ease(p / 0.4), hit: false, p };
  if (p < 0.7) return { k: 1, hit: true, p };
  return { k: ease(1 - (p - 0.7) / 0.3), hit: false, p };
}

function burst(ctx, x, y, s, color = COLORS.yellow) {
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    star(ctx, x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.18, i % 2 ? '#fff' : color);
  }
}

// 손끝 위치에 그리는 별 커서(놀이 화면의 손 표시와 같은 모양)
function cursor(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
  star(ctx, x, y, s * 0.27, COLORS.yellow, '#fff');
}

// 한 손을 목표까지 뻗는 공통 시범. side: 0 = 왼손, 1 = 오른손
function reachDemo(ctx, s, t, { kx = -1.6, ky = 0.3, side = 1, to, drawTarget, period }) {
  const { k, hit } = reach(t, period);
  const hands = REST.map((h, i) => (i === side ? lerp2(h, to, k) : h));
  drawTarget(ctx, (kx + to[0]) * s, (ky + to[1]) * s, hit);
  kid(ctx, kx * s, ky * s, s, { hands });
}

// 보기 위에 손을 올리고 기다리면 골라지는 학습 놀이 시범
function chooseDemo(ctx, s, t, labels, question) {
  question(ctx, 0, -s * 1.7);
  const p = loop(t, 3);
  const colors = [COLORS.blue, COLORS.orange, COLORS.green];
  labels.forEach((label, i) => {
    const x = (i - 1) * s * 2.6;
    const y = s * 1.3;
    const chosen = i === 1 && p > 0.75;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x, y, s * (chosen ? 0.95 : 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${s * (label.length > 1 ? 0.55 : 0.8)}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + s * 0.04);
    if (i === 1 && p > 0.25 && p <= 0.75) progressRing(ctx, x, y, s * 0.8, (p - 0.25) / 0.5, COLORS.yellow);
    if (chosen) burst(ctx, x, y - s * 0.2, s * 1.4);
  });
  // 손 커서: 왼쪽 아래에서 가운데 보기로 와서 머문다.
  const k = ease(Math.min(1, p / 0.25));
  cursor(ctx, lerp(-s * 3.5, 0, k), lerp(s * 2.8, s * 1.3, k), s);
}

export const GUIDES = {
  balloon: {
    text: '손을 뻗어서 풍선을 펑펑 터뜨려요! 괴물이 나오면 콩! 쳐 주세요.',
    demo: (ctx, s, t) =>
      reachDemo(ctx, s, t, {
        to: [1.7, -1.4],
        drawTarget: (c, x, y, hit) => (hit ? burst(c, x, y, s * 1.4, COLORS.red) : balloon(c, x, y, s * 0.55, COLORS.red)),
      }),
  },
  whack: {
    text: '두더지가 쏙 나오면 손으로 콩! 쳐서 잡아요.',
    demo: (ctx, s, t) => {
      const { k, hit, p } = reach(t, 2);
      const hx = s * 0.9;
      const hy = s * 1.2;
      ctx.fillStyle = '#5A3E2B';
      ctx.beginPath();
      ctx.ellipse(hx, hy, s * 0.8, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      const up = p < 0.75 ? 1 : 0;
      if (up) mole(ctx, hx, hy - s * 0.5, s * 0.5, hit, t);
      kid(ctx, -s * 1.4, s * 0.1, s, { hands: [REST[0], lerp2([1.3, -1.6], [2.3, 0.6], k)] });
      if (hit) burst(ctx, hx, hy - s * 1.0, s);
    },
  },
  mimic: {
    text: '위에 나오는 동물 친구의 동작을 똑같이 따라 해요. 개구리처럼 펄쩍!',
    demo: (ctx, s, t) => {
      const j = Math.abs(Math.sin(t * 3));
      ctx.save();
      ctx.translate(s * 2.2, -s * 0.6 - j * s * 0.6);
      frog(ctx, 0, 0, s * 0.7);
      ctx.restore();
      kid(ctx, -s * 1.3, s * 0.3 - j * s * 0.7, s, { hands: j > 0.5 ? UP : REST });
    },
  },
  traffic: {
    text: '음악이 나오면 신나게 춤추고, 얼음! 하면 꽁꽁 멈춰요.',
    demo: (ctx, s, t) => {
      const go = loop(t, 4) < 0.5;
      trafficLight(ctx, s * 2.4, -s * 0.2, s * 0.6, go ? 'green' : 'red');
      const swing = go ? Math.sin(t * 8) : 0;
      kid(ctx, -s * 1.0 + swing * s * 0.15, s * 0.3, s, {
        hands: go ? [[-1.2, -1.2 + swing * 0.8], [1.2, -1.2 - swing * 0.8]] : [[-1.4, -0.5], [1.4, -0.5]],
        color: go ? COLORS.orange : '#8ECAE6',
      });
    },
  },
  runner: {
    text: '통나무가 오면 펄쩍 점프! 새가 날아오면 쏙 앉아요.',
    demo: (ctx, s, t) => {
      const p = loop(t, 4);
      const isLog = p < 0.5;
      const q = (p % 0.5) / 0.5; // 장애물이 오른쪽에서 왼쪽으로
      const ox = lerp(s * 4, -s * 4, q);
      const near = Math.abs(ox + s * 0.5) < s * 1.2;
      if (isLog) log(ctx, ox, s * 1.6, s * 0.5);
      else flyingBird(ctx, ox, -s * 0.3, s * 0.5, t);
      ctx.save();
      const jump = isLog && near ? -Math.sin(((ox + s * 1.7) / (s * 2.4)) * Math.PI) * s * 1.2 : 0;
      ctx.translate(-s * 0.5, s * 0.5 + jump);
      if (!isLog && near) ctx.scale(1.1, 0.65);
      kid(ctx, 0, 0, s * 0.85, { hands: isLog && near ? UP : REST });
      ctx.restore();
    },
  },
  train: {
    text: '제자리에서 무릎을 번갈아 높이 올리며 달려요. 빨리 달릴수록 기차가 빨라져요!',
    demo: (ctx, s, t) => {
      const step = Math.floor(t * 4) % 2 ? 1 : -1;
      kid(ctx, -s * 1.5, s * 0.1 - Math.abs(Math.sin(t * 12.5)) * s * 0.1, s, {
        hands: step > 0 ? [[-0.9, -0.5], [0.8, 0.5]] : [[-0.8, 0.5], [0.9, -0.5]],
        legUp: step,
      });
      // 오른쪽에서 칙칙폭폭 연기
      for (let i = 0; i < 3; i++) {
        const k = loop(t + i * 0.4, 1.2);
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
        ctx.beginPath();
        ctx.arc(s * 2.2 + k * s, -s * 0.5 - k * s * 1.2, s * (0.25 + k * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.roundRect(s * 1.4, s * 0.2, s * 1.8, s * 1.0, s * 0.3);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(s * 2.0, -s * 0.3, s * 0.35, s * 0.55);
    },
  },
  pose: {
    text: '친구가 보여 주는 자세를 똑같이 따라 하고, 잠깐 그대로 멈춰 있어요.',
    demo: (ctx, s, t) => {
      const shapes = ['hooray', 'muscle', 'airplane'];
      const shape = POSE_SHAPES[shapes[Math.floor(t / 2) % shapes.length]];
      kid(ctx, -s * 1.8, s * 0.3, s * 0.85, { ...shape, color: COLORS.orange });
      kid(ctx, s * 1.8, s * 0.3, s * 0.85, { ...shape, color: COLORS.purple });
      if (loop(t, 2) > 0.6) burst(ctx, 0, -s * 0.8, s * 1.4);
    },
  },
  stars: {
    text: '별이 나타나면 손을 쭉 뻗어서 잡아요. 옆으로 걸어가서 잡아도 돼요!',
    demo: (ctx, s, t) => {
      const high = loop(t, 5) < 0.5;
      ctx.fillStyle = 'rgba(25,35,90,0.25)';
      ctx.fillRect(-s * 6, -s * 4, s * 12, s * 8);
      reachDemo(ctx, s, t, {
        kx: high ? -0.5 : -2.2,
        side: high ? 1 : 0,
        to: high ? [1.0, -2.3] : [-1.8, -0.6],
        period: 2.5,
        drawTarget: (c, x, y, hit) => (hit ? burst(c, x, y, s * 1.4) : star(c, x, y, s * 0.5, COLORS.yellow, '#fff')),
      });
    },
  },
  sound: {
    text: '동물 소리를 잘 듣고, 그 동물 그림에 손을 쭉 뻗어요.',
    demo: (ctx, s, t) => {
      ctx.save();
      ctx.translate(-s * 2.6, -s * 1.6);
      speakerIcon(ctx, s * 0.7, t);
      ctx.restore();
      reachDemo(ctx, s, t, {
        kx: -1.4,
        to: [2.0, -0.9],
        drawTarget: (c, x, y, hit) => {
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(x, y, s * (hit ? 0.9 : 0.75), 0, Math.PI * 2);
          c.fill();
          lion(c, x, y, s * 0.45);
          if (hit) burst(c, x, y - s * 0.3, s * 1.5);
        },
      });
    },
  },
  instrument: {
    text: '손으로 북, 실로폰, 심벌즈를 두드려서 소리를 내요.',
    demo: (ctx, s, t) => {
      const left = loop(t, 1.2) < 0.5;
      drum(ctx, -s * 2.4, s * 0.8, s * 0.6);
      const colors = [COLORS.red, COLORS.yellow, COLORS.blue];
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.roundRect(s * 1.6, s * (0.2 + i * 0.4), s * (1.4 - i * 0.2), s * 0.3, s * 0.1);
        ctx.fill();
      });
      kid(ctx, 0, s * 0.2, s * 0.9, { hands: left ? [[-2.2, 0.6], [0.8, -0.6]] : [[-0.8, -0.6], [2.0, 0.4]] });
      ctx.fillStyle = COLORS.purple;
      ctx.font = `bold ${s * 0.6}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('♪', left ? -s * 2.4 : s * 2.3, -s * 0.4);
    },
  },
  drawing: {
    text: '손바닥을 보여 주고 움직이면 그림이 그려져요. 물방울을 만지면 색이 바뀌어요.',
    demo: (ctx, s, t) => {
      const path = (k) => [s * (0.3 + Math.cos(k * Math.PI * 2) * 1.6), s * (-0.4 + Math.sin(k * Math.PI * 2) * 0.9)];
      const now = loop(t, 3);
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.25;
      for (let i = 0; i < 30; i++) {
        const k0 = now - i * 0.02;
        const k1 = now - (i + 1) * 0.02;
        if (k1 < 0) break;
        const [x0, y0] = path(k0);
        const [x1, y1] = path(k1);
        ctx.strokeStyle = `hsl(${(k0 * 720) % 360}, 95%, 58%)`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const [hx, hy] = path(now);
      kid(ctx, -s * 2.6, s * 0.6, s * 0.8, { hands: [REST[0], [(hx / s + 2.6) / 0.8, (hy / s - 0.6) / 0.8]] });
      cursor(ctx, hx, hy, s);
    },
  },
  hidden: {
    text: '그림 속에서 물건을 찾으면, 손으로 그 물건 둘레에 동그라미를 빙 그려 주세요.',
    demo: (ctx, s, t) => {
      apple(ctx, s * 0.5, 0, s * 0.6);
      const k = loop(t, 2.5);
      const done = k > 0.85;
      ctx.strokeStyle = done ? COLORS.red : COLORS.purple;
      ctx.lineWidth = s * 0.15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(s * 0.5, 0, s * 1.2, s * 1.05, 0, -Math.PI / 2, -Math.PI / 2 + Math.min(1, k / 0.85) * Math.PI * 2);
      ctx.stroke();
      const a = -Math.PI / 2 + Math.min(1, k / 0.85) * Math.PI * 2;
      if (!done) cursor(ctx, s * 0.5 + Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.05, s);
      else burst(ctx, s * 0.5, -s * 0.2, s * 2);
    },
  },
  math: {
    text: '문제를 잘 듣고, 맞는 숫자 위에 손을 올리고 잠깐 기다려요.',
    demo: (ctx, s, t) =>
      chooseDemo(ctx, s, t, ['2', '3', '5'], (c, x, y) => {
        c.fillStyle = COLORS.ink;
        c.font = `bold ${s * 0.9}px "Noto Sans KR", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('1 + 2 = ?', x, y);
      }),
  },
  hangul: {
    text: '그림을 보고, 맞는 글자 위에 손을 올리고 잠깐 기다려요.',
    demo: (ctx, s, t) => chooseDemo(ctx, s, t, ['별', '사과', '하트'], (c, x, y) => apple(c, x, y, s * 0.6)),
  },
  alphabet: {
    text: '알파벳을 잘 듣고, 맞는 글자 위에 손을 올리고 잠깐 기다려요.',
    demo: (ctx, s, t) =>
      chooseDemo(ctx, s, t, ['B', 'A', 'C'], (c, x, y) => {
        c.save();
        c.translate(x, y);
        speakerIcon(c, s * 0.75, t);
        c.restore();
      }),
  },
  highfive: {
    text: '큰 별이 나오면 둘이 같이 손을 대서 하이파이브! 둘이 함께 해야 별이 터져요.',
    demo: (ctx, s, t) => {
      const { k, hit } = reach(t, 2.4);
      if (hit) burst(ctx, 0, -s * 1.3, s * 2);
      else star(ctx, 0, -s * 1.3, s * 0.65, COLORS.yellow, '#fff');
      kid(ctx, -s * 2.2, s * 0.4, s, { hands: [REST[0], lerp2(REST[1], [1.9, -1.7], k)], color: COLORS.blue });
      kid(ctx, s * 2.2, s * 0.4, s, { hands: [lerp2(REST[0], [-1.9, -1.7], k), REST[1]], color: COLORS.pink });
    },
  },
  rally: {
    text: '공이 오면 손으로 통 쳐서 친구에게 보내요. 떨어뜨리지 말아요!',
    demo: (ctx, s, t) => {
      const p = loop(t, 3);
      const toRight = p < 0.5;
      const q = (p % 0.5) / 0.5;
      const bx = lerp(toRight ? -s * 1.7 : s * 1.7, toRight ? s * 1.7 : -s * 1.7, q);
      const by = -s * 1.0 - Math.sin(q * Math.PI) * s * 1.6;
      const leftHit = (!toRight && q > 0.85) || (toRight && q < 0.15);
      const rightHit = (toRight && q > 0.85) || (!toRight && q < 0.15);
      kid(ctx, -s * 2.7, s * 0.5, s * 0.9, { hands: [REST[0], leftHit ? [1.1, -1.7] : REST[1]], color: COLORS.blue });
      kid(ctx, s * 2.7, s * 0.5, s * 0.9, { hands: [rightHit ? [-1.1, -1.7] : REST[0], REST[1]], color: COLORS.pink });
      const colors = [COLORS.red, '#fff', COLORS.blue, '#fff', COLORS.yellow, '#fff'];
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.arc(bx, by, s * 0.45, t * 3 + (i * Math.PI) / 3, t * 3 + ((i + 1) * Math.PI) / 3);
        ctx.fill();
      });
    },
  },
  mirror: {
    text: '왕관 쓴 친구가 자세를 만들면, 다른 친구가 똑같이 따라 해요. 성공하면 왕관이 넘어가요.',
    demo: (ctx, s, t) => {
      const shapes = ['oneHand', 'muscle', 'star'];
      const i = Math.floor(t / 2) % shapes.length;
      const follow = loop(t, 2) > 0.45 ? i : (i + shapes.length - 1) % shapes.length;
      kid(ctx, -s * 1.9, s * 0.4, s * 0.85, { ...POSE_SHAPES[shapes[i]], color: COLORS.yellow });
      kid(ctx, s * 1.9, s * 0.4, s * 0.85, { ...POSE_SHAPES[shapes[follow]], color: COLORS.blue });
      // 왕관
      ctx.fillStyle = COLORS.yellow;
      ctx.strokeStyle = '#F4A100';
      ctx.lineWidth = s * 0.06;
      const cx = -s * 1.9;
      const cy = -s * 1.35;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.4, cy);
      ctx.lineTo(cx - s * 0.4, cy - s * 0.35);
      ctx.lineTo(cx - s * 0.2, cy - s * 0.15);
      ctx.lineTo(cx, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.2, cy - s * 0.15);
      ctx.lineTo(cx + s * 0.4, cy - s * 0.35);
      ctx.lineTo(cx + s * 0.4, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (follow === i && loop(t, 2) > 0.7) heart(ctx, 0, -s * 1.2, s * 0.45, COLORS.pink);
    },
  },
  team: {
    text: '왼쪽 친구는 파란 풍선, 오른쪽 친구는 빨간 풍선을 터뜨려요. 둘 다 별을 모아요!',
    demo: (ctx, s, t) => {
      const { k, hit } = reach(t, 2.2);
      ctx.strokeStyle = 'rgba(61,44,46,0.25)';
      ctx.setLineDash([s * 0.2, s * 0.15]);
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(0, -s * 2.5);
      ctx.lineTo(0, s * 2.2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [side, color] of [[-1, COLORS.blue], [1, COLORS.red]]) {
        const bx = side * s * 3.3;
        const by = -s * 1.2;
        if (hit) burst(ctx, bx, by, s * 1.4, color);
        else balloon(ctx, bx, by, s * 0.5, color);
        const kx = side * s * 1.8;
        const outer = side < 0 ? 0 : 1;
        const hands = REST.map((h, i) => (i === outer ? lerp2(h, [side * 1.5, -1.6], k) : h));
        kid(ctx, kx, s * 0.5, s * 0.85, { hands, color });
      }
    },
  },
};

// 설명 카드 그리기(놀이 영역 가운데)
export function drawGuide(ctx, game, guide) {
  const { w, h, zone: z } = game;
  const cw = Math.min(z.w * 0.85, z.h * 1.35);
  const ch = cw * 0.62;
  const x = w / 2 - cw / 2;
  const y = h / 2 - ch / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.roundRect(x, y + ch * 0.02, cw, ch, ch * 0.08);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.roundRect(x, y, cw, ch, ch * 0.08);
  ctx.fill();
  ctx.clip();
  ctx.translate(w / 2, h / 2);
  guide.demo(ctx, ch * 0.11, guide.t);
  ctx.restore();
}
