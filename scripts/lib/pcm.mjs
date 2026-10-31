// 16bit 모노 PCM 다루기: 무음 자르기, 여러 낱말이 든 녹음을 낱말별로 나누기, WAV 저장

const WINDOW = 0.02; // 소리 크기를 재는 구간(초)
const PAD = 0.08; // 잘라 낸 소리 앞뒤에 남기는 여유(초)

function windowsRms(pcm, rate) {
  const n = Math.max(1, Math.round(rate * WINDOW));
  const out = [];
  for (let i = 0; i < pcm.length; i += n) {
    let sum = 0;
    const end = Math.min(pcm.length, i + n);
    for (let j = i; j < end; j++) sum += pcm[j] * pcm[j];
    out.push(Math.sqrt(sum / (end - i)));
  }
  return { rms: out, n };
}

const isLoud = (rms) => {
  const thr = Math.max(Math.max(...rms) * 0.06, 150);
  return rms.map((v) => v > thr);
};

// 앞뒤 무음을 잘라 낸다(pad 초만큼 여유를 남긴다).
export function trim(pcm, rate, pad = PAD) {
  const { rms, n } = windowsRms(pcm, rate);
  const loud = isLoud(rms);
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return pcm;
  const p = Math.round(pad * rate);
  return pcm.subarray(Math.max(0, first * n - p), Math.min(pcm.length, (last + 1) * n + p));
}

// 소리 사이의 뚜렷한 쉼(minGap 초 이상 무음) 구간들
function pauses(loud, first, last, minGap) {
  const out = [];
  for (let i = first; i <= last; i++) {
    if (loud[i]) continue;
    const start = i;
    while (i <= last && !loud[i]) i++;
    if ((i - start) * WINDOW >= minGap) out.push({ start, end: i });
  }
  return out;
}

export function countPauses(pcm, rate, minGap = 0.25) {
  const loud = isLoud(windowsRms(pcm, rate).rms);
  return pauses(loud, loud.indexOf(true), loud.lastIndexOf(true), minGap).length;
}

// 녹음 하나를 count 개 조각으로 나눈다: 뚜렷한 쉼(minGap 초 이상 무음)에서 자른다.
// 쉼의 개수가 정확히 count-1 이 아니거나 조각 길이가 [minLen, maxLen] 초를 벗어나면 null.
// (낱말을 빠뜨리거나 덧붙여 읽었을 때 파일이 한 칸씩 밀려 엉뚱한 소리가 나는 것을 막는다.)
export function split(pcm, rate, count, { minGap = 0.25, minLen = 0.15, maxLen = 2.5 } = {}) {
  const { rms, n } = windowsRms(pcm, rate);
  const loud = isLoud(rms);
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return null;

  let cuts = pauses(loud, first, last, minGap);
  // 낱말 안에서 잠깐 끊어 읽은 쉼이 섞여 쉼이 더 많으면: 남는 쉼이 낱말 사이 쉼보다 뚜렷이 짧을 때만 무시한다.
  if (cuts.length > count - 1 && count > 1) {
    const byLen = [...cuts].sort((a, b) => b.end - b.start - (a.end - a.start));
    const kept = byLen.slice(0, count - 1);
    const longestDropped = byLen[count - 1].end - byLen[count - 1].start;
    const median = kept[Math.floor(kept.length / 2)].end - kept[Math.floor(kept.length / 2)].start;
    if (longestDropped >= median * 0.6) return null;
    cuts = kept.sort((a, b) => a.start - b.start);
  }
  if (cuts.length !== count - 1) return null;

  const pieces = [];
  let from = first;
  for (const g of cuts) {
    pieces.push([from, g.start]);
    from = g.end;
  }
  pieces.push([from, last + 1]);

  const ok = pieces.every(([a, b]) => {
    const len = ((b - a) * n) / rate;
    return len >= minLen && len <= maxLen;
  });
  if (!ok) return null;
  // 조각마다 앞뒤로 PAD 만큼 여유를 둔다(쉼이 PAD*2 보다 길어 이웃 낱말과 겹치지 않는다).
  const p = Math.round(PAD * rate);
  return pieces.map(([a, b]) => trim(pcm.subarray(Math.max(0, a * n - p), Math.min(pcm.length, b * n + p)), rate));
}

export function toWav(pcm, rate) {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 모노
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export const seconds = (pcm, rate) => pcm.length / rate;
