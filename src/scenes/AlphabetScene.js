import { QuizScene, questionCard } from './QuizScene.js';
import { speakerIcon } from '../engine/icons.js';
import { preloadLines, sayLine } from '../engine/voice.js';
import { LETTERS, PHRASES } from '../engine/voiceLines.js';
import { delay, pick, shuffle } from '../engine/util.js';

const CHOICE_COUNT = 4;

// 원어민 발음 음성 파일로 읽는다(없으면 기기 영어 TTS).
const sayLetter = (letter) => sayLine('letters', letter, letter, { lang: 'en-US' });
const sayPhrase = (id) => sayLine('phrases', id, PHRASES[id]);

// 알파벳 놀이: 읽어 주는 알파벳(대문자) 고르기
export class AlphabetScene extends QuizScene {
  enter() {
    preloadLines('letters', LETTERS);
    preloadLines('phrases', ['alphabet-intro', 'alphabet-celebrate', 'correct', 'listen-again']);
    super.enter();
  }

  intro() {
    return sayPhrase('alphabet-intro');
  }

  celebrate() {
    return sayPhrase('alphabet-celebrate');
  }

  makeQuestion() {
    const letter = pick(LETTERS.filter((l) => l !== this.lastLetter));
    this.lastLetter = letter;
    const others = shuffle(LETTERS.filter((l) => l !== letter)).slice(0, CHOICE_COUNT - 1);
    const choices = shuffle([letter, ...others]).map((l) => ({ label: l, correct: l === letter }));
    return { letter, choices };
  }

  // 두 번 또박또박 읽어 준다.
  prompt(q) {
    return sayLetter(q.letter)
      .then(() => delay(500))
      .then(() => sayLetter(q.letter));
  }

  onCorrect(q) {
    return sayLetter(q.letter).then(() => sayPhrase('correct'));
  }

  // 고른 글자를 읽어 주고, 문제 글자를 다시 들려준다.
  onWrong(q, choice) {
    return sayLetter(choice.label)
      .then(() => delay(400))
      .then(() => sayPhrase('listen-again'))
      .then(() => this.prompt(q));
  }

  drawQuestion(ctx, box) {
    questionCard(ctx, box, 1.1);
    ctx.save();
    ctx.translate(box.x, box.y);
    const s = 1 + Math.sin(this.qAge * 4) * 0.04;
    ctx.scale(s, s);
    speakerIcon(ctx, box.size * 0.8, this.qAge);
    ctx.restore();
  }
}
