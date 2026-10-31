// 미리 만들어 둔 음성 파일(public/voices/<group>/<id>.wav)로 읽어 주는 문장 목록.
// scripts/generate-voices.mjs 가 이 목록으로 파일을 만든다.
import { THINGS } from './things.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// 한글 놀이 낱말: things.js 의 id → 이름
export const WORDS = Object.fromEntries(Object.entries(THINGS).map(([id, t]) => [id, t.name]));

export const PHRASES = {
  'alphabet-intro': '알파벳을 잘 듣고 맞는 글자를 골라 보세요!',
  'alphabet-celebrate': '알파벳 박사! 정말 잘했어요!',
  'hangul-intro': '그림을 보고 맞는 글자를 골라 보세요!',
  'hangul-celebrate': '한글 박사! 정말 잘했어요!',
  'what-is-this': '이건 뭘까요?',
  correct: '맞아요!',
  'listen-again': '다시 들어 볼까요?',
};
