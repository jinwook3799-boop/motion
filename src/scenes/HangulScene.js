import { QuizScene, questionCard } from './QuizScene.js';
import { THINGS } from '../engine/things.js';
import { speak } from '../engine/voice.js';
import { pick, shuffle } from '../engine/util.js';

const CHOICE_COUNT = 3;

// 한글 놀이: 그림을 보고 맞는 낱말 고르기
export class HangulScene extends QuizScene {
  introText = '그림을 보고 맞는 글자를 골라 보세요!';
  celebrateText = '한글 박사! 정말 잘했어요!';

  makeQuestion() {
    const ids = Object.keys(THINGS).filter((id) => id !== this.lastId);
    const id = pick(ids);
    this.lastId = id;
    const others = shuffle(ids.filter((o) => o !== id)).slice(0, CHOICE_COUNT - 1);
    const choices = shuffle([id, ...others]).map((o) => ({ label: THINGS[o].name, correct: o === id }));
    return { id, choices };
  }

  prompt() {
    return speak('이건 뭘까요?');
  }

  // 고른 낱말을 읽어 준다.
  onCorrect(q, choice) {
    return speak(choice.label).then(() => speak('맞아요!'));
  }

  onWrong(q, choice) {
    return speak(choice.label);
  }

  drawQuestion(ctx, box) {
    questionCard(ctx, box, 1.1);
    const bob = Math.sin(this.qAge * 3) * box.size * 0.04;
    THINGS[this.q.id].draw(ctx, box.x, box.y + bob, box.size * 0.62, this.qAge);
  }
}
