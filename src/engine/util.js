export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 같은 seed 면 같은 난수열(화면 크기가 바뀌어도 같은 그림을 다시 그리기 위해)
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 받침이 있으면 a, 없으면 b 를 붙인다. 예) josa('사과', '을', '를') → '사과를'
export function josa(word, a, b) {
  const code = word.charCodeAt(word.length - 1);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return word + (hasFinal ? a : b);
}
