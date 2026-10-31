import { HoverButton } from '../engine/HoverButton.js';
import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { ANIMAL_INFO } from '../engine/animals.js';
import { questionMark } from '../engine/icons.js';
import { loadSample, playSample, sfx, stopSample } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const GOAL = 5;
const CARD_COUNT = 4;
const REPLAY_AFTER = 10; // 초
const ASK_DELAY = 1000; // 울음소리가 끝나고 질문하기까지 쉬는 시간(ms)

const soundUrl = (id) => `${import.meta.env.BASE_URL}sounds/animals/${id}.mp3`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 실제 울음소리를 들려준다. 파일을 못 쓰면 의성어를 읽어 준다.
async function animalSound(id) {
  if (await playSample(soundUrl(id))) return;
  await speak(`${ANIMAL_INFO[id].sound}~`);
}

// 모듈 4. 동물 소리 듣고 찾아가기
export class SoundScene {
  constructor(game) {
    this.game = game;
    this.question = new HoverButton({
      drawIcon: questionMark,
      onActivate: () => this.playTarget(),
      ringColor: COLORS.purple,
      dwell: 1.2,
    });
  }

  onResize() {
    const { w, unit, zone: z } = this.game;
    this.cardR = Math.min(unit * 0.13, z.w * 0.11);
    const r = this.cardR;
    // 왼쪽·왼쪽 위·오른쪽 위·오른쪽: 손을 옆이나 위로 뻗어야 닿는 자리(쉬는 손에 실수로 닿지 않게)
    this.slots = [
      { x: z.x + r * 1.2, y: z.y + z.h * 0.62 },
      { x: z.x + z.w * 0.27, y: z.y + r * 1.2 },
      { x: z.x + z.w * 0.73, y: z.y + r * 1.2 },
      { x: z.x + z.w - r * 1.2, y: z.y + z.h * 0.62 },
    ];
    this.question.place(w / 2, z.y + z.h * 0.45, r * 0.75);
    this.cards?.forEach((c, i) => c.button.place(this.slots[i].x, this.slots[i].y, r));
  }

  enter() {
    this.token = 0;
    this.active = true;
    this.state = 'intro';
    this.score = 0;
    this.cards = [];
    this.slotPulse = new Array(GOAL).fill(0);
    for (const id of Object.keys(ANIMAL_INFO)) loadSample(soundUrl(id));
    this.after(speak('동물 소리를 잘 듣고, 그 동물에게 손을 쭉 뻗어 보세요!'), () => this.newRound());
  }

  exit() {
    this.active = false;
    stopSample();
  }

  // promise 가 끝난 뒤 fn 을 실행한다. 그사이 장면을 떠났거나 다음 단계로 넘어갔으면(token 변경) 무시한다.
  after(promise, fn) {
    const token = ++this.token;
    promise.then(() => {
      if (this.active && this.token === token) fn();
    });
  }

  newRound() {
    if (this.score >= GOAL) this.score = 0;
    const ids = shuffle(Object.keys(ANIMAL_INFO)).slice(0, CARD_COUNT);
    this.target = ids[(Math.random() * ids.length) | 0];
    this.cards = ids.map((id, i) => {
      const info = ANIMAL_INFO[id];
      const card = { id, info, age: 0, shake: 0, win: 0 };
      card.button = new HoverButton({
        drawIcon: (ctx, r, t) => info.draw(ctx, 0, 0, r * 0.55, t),
        onActivate: () => this.choose(card),
        ringColor: info.color,
        dwell: 0.7,
      });
      card.button.place(this.slots[i].x, this.slots[i].y, this.cardR);
      return card;
    });
    sfx.whoosh();
    this.state = 'listen';
    this.playTarget();
  }

  // 울음소리 → 1초 쉬고 → "나는 누구일까요?"
  playTarget() {
    if (this.state !== 'listen') return;
    this.replayT = REPLAY_AFTER;
    this.after(
      animalSound(this.target).then(() => delay(ASK_DELAY)),
      () => speak('나는 누구일까요?'),
    );
  }

  choose(card) {
    if (this.state !== 'listen') return;
    const { particles, unit } = this.game;
    const { x, y } = card.button;
    if (card.id === this.target) {
      this.state = 'correct';
      card.win = 1;
      this.slotPulse[this.score] = 1;
      this.score++;
      sfx.success();
      particles.burst(x, y, { count: 40, colors: RAINBOW, speed: unit * 0.8, size: unit * 0.02, shape: 'confetti' });
      const finished = this.score >= GOAL;
      this.after(
        animalSound(card.id)
          .then(() => speak(`맞아요! ${card.info.name}예요!`))
          .then(() => {
            if (!finished) return;
            sfx.fanfare();
            return speak('동물 소리 박사! 최고예요!');
          }),
        () => this.newRound(),
      );
    } else {
      // 틀려도 그 동물 소리를 들려주며 배우게 한다.
      this.state = 'wrong';
      card.shake = 1;
      card.button.disabled = true;
      sfx.oops();
      this.after(
        animalSound(card.id).then(() => speak(`이건 ${card.info.name}예요. 다시 들어 볼까요?`)),
        () => {
          this.state = 'listen';
          this.playTarget();
        },
      );
    }
  }

  onTap(x, y) {
    if (this.state !== 'listen') return;
    if (this.question.tap(x, y)) return;
    this.cards.some((c) => c.button.tap(x, y));
  }

  update(dt, input) {
    for (let i = 0; i < GOAL; i++) this.slotPulse[i] = Math.max(0, this.slotPulse[i] - dt * 2.5);
    const pointers = this.state === 'listen' ? input.pointers : [];
    for (const c of this.cards) {
      c.age += dt;
      c.shake = Math.max(0, c.shake - dt * 1.5);
      c.button.update(dt, pointers);
      c.button.boost = Math.min(1, c.age * 4) * (1 + c.win * (0.35 + Math.sin(c.age * 8) * 0.05));
      c.button.offsetX = Math.sin(c.age * 40) * c.shake * this.cardR * 0.15;
    }
    this.question.update(dt, pointers);
    if (this.state === 'listen') {
      this.replayT -= dt;
      if (this.replayT <= 0) this.playTarget();
    }
  }

  draw(ctx) {
    if (this.state !== 'intro') {
      for (const c of this.cards) {
        ctx.save();
        if (c.button.disabled) ctx.globalAlpha = 0.45;
        c.button.draw(ctx);
        ctx.restore();
      }
      if (this.state === 'listen') this.question.draw(ctx);
    }
    this.drawGauge(ctx);
  }

  drawGauge(ctx) {
    const { w, h, unit } = this.game;
    const s = unit * 0.035;
    const gap = s * 2.5;
    const y = h * 0.055 + s;
    const x0 = w / 2 - (gap * (GOAL - 1)) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.roundRect(x0 - s * 1.6, y - s * 1.5, gap * (GOAL - 1) + s * 3.2, s * 3, s * 1.5);
    ctx.fill();
    for (let i = 0; i < GOAL; i++) {
      const filled = i < this.score;
      star(ctx, x0 + i * gap, y, s * (1 + this.slotPulse[i] * 0.6), filled ? COLORS.yellow : 'rgba(61,44,46,0.15)', filled ? '#F4A100' : null);
    }
  }
}
