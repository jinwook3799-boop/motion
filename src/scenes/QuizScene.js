import { HoverButton } from '../engine/HoverButton.js';
import { COLORS, RAINBOW } from '../engine/draw.js';
import { speakerIcon, starGauge } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const CHOICE_COLORS = [COLORS.blue, COLORS.orange, COLORS.green, COLORS.purple];
const REPLAY_AFTER = 12; // 아무것도 고르지 않으면 이만큼(초) 뒤에 문제를 다시 들려준다

// 보기 중에서 정답을 고르는 학습 놀이의 공통 틀(숫자·한글·알파벳).
// 하위 클래스가 구현할 것:
//   introText, celebrateText
//   makeQuestion() → { choices: [{ label, correct }], ... }
//   prompt(q) → Promise           문제 들려주기
//   onCorrect(q, choice) → Promise 맞혔을 때 말하기
//   onWrong(q, choice) → Promise   틀렸을 때 말하기(끝나면 다시 고를 수 있다)
//   drawQuestion(ctx, box)        문제 그리기
export class QuizScene {
  goal = 5;
  dwell = 1.2; // 보기 위에 손을 이만큼(초) 올려 두면 선택

  constructor(game) {
    this.game = game;
    this.choices = [];
    this.replay = new HoverButton({ drawIcon: speakerIcon, onActivate: () => this.ask(), ringColor: COLORS.purple, dwell: 1.2 });
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.box = { x: z.x + z.w / 2, y: z.y + z.h * 0.33, size: Math.min(z.h * 0.24, z.w * 0.2) };
    const rr = unit * 0.06;
    this.replay.place(z.x + z.w - rr * 1.4, z.y + rr * 1.4, rr);
    this.layoutChoices();
  }

  layoutChoices() {
    const { unit, zone: z } = this.game;
    const n = this.choices.length;
    if (!n) return;
    this.choiceR = Math.min(unit * 0.11, z.w / (n * 2.8));
    this.choices.forEach((c, i) => c.button.place(z.x + (z.w * (i + 0.5)) / n, z.y + z.h * 0.78, this.choiceR));
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.solved = 0;
    this.pulse = new Array(this.goal).fill(0);
    this.choices = [];
    this.state = 'intro';
    this.after(speak(this.introText), () => this.next());
  }

  exit() {
    this.active = false;
  }

  // promise 가 끝난 뒤 fn 실행. 그사이 장면을 떠났거나 다음 단계로 넘어갔으면 무시한다.
  after(promise, fn) {
    const token = ++this.token;
    promise.then(() => {
      if (this.active && this.token === token) fn();
    });
  }

  next() {
    if (this.score >= this.goal) this.score = 0;
    this.q = this.makeQuestion();
    this.choices = this.q.choices.map((choice, i) => {
      const entry = { choice, age: 0, shake: 0, win: 0 };
      entry.button = new HoverButton({
        drawIcon: (ctx, r) => this.drawChoice(ctx, r, choice, CHOICE_COLORS[i % CHOICE_COLORS.length]),
        onActivate: () => this.choose(entry),
        ringColor: CHOICE_COLORS[i % CHOICE_COLORS.length],
        dwell: this.dwell,
      });
      return entry;
    });
    this.layoutChoices();
    this.qAge = 0;
    this.state = 'answer';
    sfx.whoosh();
    this.ask();
  }

  ask() {
    this.replayT = REPLAY_AFTER;
    this.after(this.prompt(this.q), () => {});
  }

  choose(entry) {
    if (this.state !== 'answer') return;
    const { particles, unit } = this.game;
    const { x, y } = entry.button;
    if (entry.choice.correct) {
      this.state = 'correct';
      entry.win = 1;
      this.pulse[this.score] = 1;
      this.score++;
      this.solved++;
      sfx.success();
      particles.burst(x, y, { count: 40, colors: RAINBOW, speed: unit * 0.8, size: unit * 0.02, shape: 'confetti' });
      const done = this.onCorrect(this.q, entry.choice).then(() => {
        if (this.score < this.goal) return;
        sfx.fanfare();
        return speak(this.celebrateText);
      });
      this.after(done, () => this.next());
    } else {
      this.state = 'wrong';
      entry.shake = 1;
      entry.button.disabled = true;
      sfx.oops();
      this.after(this.onWrong(this.q, entry.choice), () => {
        this.state = 'answer';
        this.replayT = REPLAY_AFTER;
      });
    }
  }

  onTap(x, y) {
    if (this.state !== 'answer') return;
    if (this.replay.tap(x, y)) return;
    this.choices.some((c) => c.button.tap(x, y));
  }

  update(dt, input) {
    this.qAge = (this.qAge ?? 0) + dt;
    for (let i = 0; i < this.goal; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    const pointers = this.state === 'answer' ? input.pointers : [];
    for (const c of this.choices) {
      c.age += dt;
      c.shake = Math.max(0, c.shake - dt * 1.5);
      c.button.update(dt, pointers);
      c.button.boost = Math.min(1, c.age * 4) * (1 + c.win * (0.3 + Math.sin(c.age * 8) * 0.05));
      c.button.offsetX = Math.sin(c.age * 40) * c.shake * this.choiceR * 0.15;
    }
    this.replay.update(dt, pointers);
    if (this.state === 'answer') {
      this.replayT -= dt;
      if (this.replayT <= 0) this.ask();
    }
  }

  // 보기 동그라미 안의 글자. 글자 수에 따라 크기를 줄인다.
  drawChoice(ctx, r, choice, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
    ctx.fill();
    const len = [...choice.label].length;
    const size = r * (len <= 1 ? 1.05 : len === 2 ? 0.78 : 0.56);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${size}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(choice.label, 0, size * 0.06);
  }

  draw(ctx) {
    if (this.state !== 'intro' && this.q) {
      this.drawQuestion(ctx, this.box);
      for (const c of this.choices) {
        ctx.save();
        if (c.button.disabled) ctx.globalAlpha = 0.4;
        c.button.draw(ctx);
        ctx.restore();
      }
      if (this.state === 'answer') this.replay.draw(ctx);
    }
    starGauge(ctx, this.game, this.goal, this.score, this.pulse);
  }
}

// 문제 카드 배경(흰 둥근 사각형)
export function questionCard(ctx, box, widthRatio = 1.6) {
  const w = box.size * widthRatio * 2;
  const h = box.size * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(box.x - w / 2, box.y - h / 2, w, h, box.size * 0.3);
  ctx.fill();
}
