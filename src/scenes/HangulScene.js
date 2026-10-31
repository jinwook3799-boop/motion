import { QuizScene, questionCard } from './QuizScene.js';
import { THINGS } from '../engine/things.js';
import { preloadLines, sayLine } from '../engine/voice.js';
import { PHRASES, WORDS } from '../engine/voiceLines.js';
import { pick, shuffle } from '../engine/util.js';

const CHOICE_COUNT = 3;

// 자연스러운 음성 파일로 읽는다(없으면 기기 TTS).
const sayWord = (id) => sayLine('words', id, WORDS[id]);
const sayPhrase = (id) => sayLine('phrases', id, PHRASES[id]);

// 한글 놀이: 그림을 보고 맞는 낱말 고르기
export class HangulScene extends QuizScene {
  enter() {
    preloadLines('words', Object.keys(WORDS));
    preloadLines('phrases', ['hangul-intro', 'hangul-celebrate', 'what-is-this', 'correct']);
    super.enter();
  }

  intro() {
    return sayPhrase('hangul-intro');
  }

  celebrate() {
    return sayPhrase('hangul-celebrate');
  }

  makeQuestion() {
    const ids = Object.keys(THINGS).filter((id) => id !== this.lastId);
    const id = pick(ids);
    this.lastId = id;
    const others = shuffle(ids.filter((o) => o !== id)).slice(0, CHOICE_COUNT - 1);
    const choices = shuffle([id, ...others]).map((o) => ({ id: o, label: THINGS[o].name, correct: o === id }));
    return { id, choices };
  }

  prompt() {
    return sayPhrase('what-is-this');
  }

  // 고른 낱말을 읽어 준다.
  onCorrect(q, choice) {
    return sayWord(choice.id).then(() => sayPhrase('correct'));
  }

  onWrong(q, choice) {
    return sayWord(choice.id);
  }

  drawQuestion(ctx, box) {
    questionCard(ctx, box, 1.1);
    const bob = Math.sin(this.qAge * 3) * box.size * 0.04;
    THINGS[this.q.id].draw(ctx, box.x, box.y + bob, box.size * 0.62, this.qAge);
  }
}
