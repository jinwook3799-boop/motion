import { QuizScene, questionCard } from './QuizScene.js';
import { COLORS } from '../engine/draw.js';
import { apple } from '../engine/icons.js';
import { speak } from '../engine/voice.js';
import { shuffle } from '../engine/util.js';

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
// 10 이하의 작은 수는 사과 그림으로 세어 볼 수 있게 한다.
const showApples = (q) => q.a <= 10 && q.b <= 10;

// 맞힌 문제 수에 따라 난이도를 올린다. 결과와 수는 모두 두 자리(99)까지.
const LEVELS = [
  { upTo: 5, plus: () => [rand(1, 5), rand(1, 5)], minus: () => ((a) => [a, rand(1, a - 1)])(rand(2, 10)) },
  { upTo: 12, plus: () => ((a) => [a, rand(1, 20 - a)])(rand(2, 15)), minus: () => ((a) => [a, rand(1, a - 1)])(rand(6, 20)) },
  { upTo: Infinity, plus: () => ((a) => [a, rand(1, 99 - a)])(rand(10, 89)), minus: () => ((a) => [a, rand(1, a - 1)])(rand(10, 99)) },
];

// 숫자 놀이: 덧셈·뺄셈
export class MathScene extends QuizScene {
  introText = '숫자 놀이를 해 볼까요? 잘 듣고 맞는 숫자를 골라 보세요!';
  celebrateText = '숫자 박사! 정말 잘했어요!';

  makeQuestion() {
    const level = LEVELS.find((l) => this.solved < l.upTo);
    const op = Math.random() < 0.5 ? '+' : '-';
    const [a, b] = op === '+' ? level.plus() : level.minus();
    const answer = op === '+' ? a + b : a - b;
    // 헷갈릴 만한 가까운 수로 보기를 만든다.
    const near = shuffle([answer - 1, answer + 1, answer - 2, answer + 2, answer + 10, answer - 10, answer + 3]);
    const wrong = [...new Set(near.filter((n) => n >= 0 && n <= 99 && n !== answer))].slice(0, 3);
    const choices = shuffle([answer, ...wrong]).map((n) => ({ label: String(n), correct: n === answer }));
    return { a, b, op, answer, choices, word: op === '+' ? '더하기' : '빼기' };
  }

  prompt(q) {
    return speak(`${q.a} ${q.word} ${q.b}`);
  }

  onCorrect(q) {
    return speak(`${q.a} ${q.word} ${q.b}, ${q.answer}! 맞아요!`);
  }

  onWrong() {
    return speak('다시 생각해 볼까요?');
  }

  drawQuestion(ctx, box) {
    const q = this.q;
    questionCard(ctx, box, 1.9);
    const size = box.size * 0.62;
    ctx.font = `bold ${size}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ty = showApples(q) ? box.y - box.size * 0.35 : box.y;
    const parts = [
      { text: String(q.a), color: COLORS.blue },
      { text: q.op === '+' ? ' + ' : ' − ', color: COLORS.ink },
      { text: String(q.b), color: COLORS.orange },
      { text: ' = ', color: COLORS.ink },
      { text: '?', color: COLORS.purple },
    ];
    const widths = parts.map((p) => ctx.measureText(p.text).width);
    let x = box.x - widths.reduce((s, w) => s + w, 0) / 2;
    parts.forEach((p, i) => {
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x + widths[i] / 2, ty);
      x += widths[i];
    });
    if (showApples(q)) this.drawApples(ctx, box, q);
  }

  // 작은 수일 때 사과를 세어 볼 수 있게 보여 준다. 뺄셈은 빼는 만큼 흐리게 X 표시.
  drawApples(ctx, box, q) {
    const s = Math.min(box.size * 0.11, (box.size * 3.4) / ((q.op === '+' ? q.a + q.b : q.a) * 2.6 + 3));
    const gap = s * 2.5;
    const y = box.y + box.size * 0.5;
    const groups = q.op === '+' ? [q.a, q.b] : [q.a];
    const total = groups.reduce((n, g) => n + g, 0) * gap + (groups.length - 1) * gap;
    let x = box.x - total / 2 + gap / 2;
    groups.forEach((count, g) => {
      for (let i = 0; i < count; i++) {
        const crossed = q.op === '-' && i >= q.a - q.b;
        ctx.save();
        ctx.globalAlpha = crossed ? 0.35 : 1;
        apple(ctx, x, y, s);
        ctx.restore();
        if (crossed) {
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = s * 0.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - s * 0.7, y - s * 0.7);
          ctx.lineTo(x + s * 0.7, y + s * 0.7);
          ctx.moveTo(x + s * 0.7, y - s * 0.7);
          ctx.lineTo(x - s * 0.7, y + s * 0.7);
          ctx.stroke();
        }
        x += gap;
      }
      if (g < groups.length - 1) x += gap;
    });
  }
}
