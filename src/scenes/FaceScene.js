import { star, COLORS, RAINBOW } from '../engine/draw.js';
import { heart, starGauge } from '../engine/icons.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { shuffle } from '../engine/util.js';
import { firework, PLAYER_COLORS } from './common.js';

const GOAL = 8; // 이만큼 따라 하면 크게 축하
const HOLD = 0.7; // 표정을 이만큼(초) 유지하면 성공
// 표정 점수 기준(MediaPipe 표정 점수 0~1). 점수 ÷ 기준 ≥ 1 이면 그 표정으로 본다.
// 아이들은 과장해서 하므로 넉넉하게, 슬픈·화난 표정처럼 어려운 것은 시간이 지나면 더 너그럽게.
const EASY_SCALE = 0.65; // 너그러운 판정: 기준의 이 비율만 넘어도 인정
const EASY_AFTER = { hard: 4, normal: 8 }; // 이 시간(초)이 지나면 너그러운 판정 + 응원
const CHANGE_AFTER = { hard: 7, normal: 12 }; // 이 시간(초)이 지나면 관련 표정이 평소보다 크게 바뀌기만 해도 인정
const CHANGE_MIN = 0.3; // '크게 바뀜' 기준(평소 표정 점수와의 차이)
const BASELINE_RATE = 0.5; // 평소(무표정) 점수를 따라가는 빠르기(/초)
const BADGE_MIN = 0.85; // 얼굴 스티커에 '지금 표정'을 보여 줄 최소 점수 비율

const val = (s, k) => s[k] ?? 0;
const avg = (s, a, b) => (val(s, a) + val(s, b)) / 2;
const max2 = (s, a, b) => Math.max(val(s, a), val(s, b));

// 따라 할 표정. score: 1 이상이면 성공, keys: '크게 바뀜'을 볼 표정 점수 이름, alt: 너그러울 때 함께 받아 주는 동작
const EMOTIONS = {
  happy: {
    voice: '웃는 얼굴을 해 봐요!',
    score: (s) => avg(s, 'mouthSmileLeft', 'mouthSmileRight') / 0.45,
    keys: ['mouthSmileLeft', 'mouthSmileRight'],
  },
  surprised: {
    voice: '깜짝! 놀란 얼굴을 해 봐요! 입을 크게 벌려요!',
    // 입을 벌리고(웃으며 벌린 입은 빼고) 눈썹을 올리거나 눈을 크게
    score: (s) => {
      const jaw = val(s, 'jawOpen');
      const up = Math.max(val(s, 'browInnerUp'), avg(s, 'browOuterUpLeft', 'browOuterUpRight'), max2(s, 'eyeWideLeft', 'eyeWideRight'));
      const smile = avg(s, 'mouthSmileLeft', 'mouthSmileRight');
      return Math.min(jaw / 0.3, (jaw + up - smile * 0.5) / 0.55);
    },
    keys: ['jawOpen', 'browInnerUp', 'eyeWideLeft', 'eyeWideRight'],
  },
  sad: {
    voice: '앙앙, 슬픈 얼굴을 해 봐요!',
    hard: true,
    score: (s) => {
      const smile = avg(s, 'mouthSmileLeft', 'mouthSmileRight');
      return Math.max(avg(s, 'mouthFrownLeft', 'mouthFrownRight') / 0.25, (val(s, 'browInnerUp') - smile) / 0.45);
    },
    keys: ['mouthFrownLeft', 'mouthFrownRight', 'browInnerUp', 'mouthShrugLower', 'mouthPucker'],
  },
  angry: {
    voice: '부글부글, 화난 얼굴을 해 봐요!',
    hard: true,
    score: (s) => Math.max(avg(s, 'browDownLeft', 'browDownRight') / 0.35, avg(s, 'noseSneerLeft', 'noseSneerRight') / 0.35),
    keys: ['browDownLeft', 'browDownRight', 'noseSneerLeft', 'noseSneerRight', 'mouthPressLeft', 'mouthPressRight'],
  },
  kiss: {
    voice: '쪽! 뽀뽀하는 얼굴을 해 봐요!',
    score: (s) => val(s, 'mouthPucker') / 0.5,
    keys: ['mouthPucker', 'mouthFunnel'],
  },
  puff: {
    voice: '볼을 빵빵하게 부풀려 봐요!',
    hard: true,
    score: (s) => val(s, 'cheekPuff') / 0.3,
    keys: ['cheekPuff', 'mouthPucker', 'mouthRollLower', 'mouthRollUpper', 'mouthPressLeft', 'mouthPressRight'],
  },
  wink: {
    voice: '한쪽 눈을 찡긋! 윙크해 봐요!',
    hard: true,
    score: (s) => Math.abs(val(s, 'eyeBlinkLeft') - val(s, 'eyeBlinkRight')) / 0.35,
    // 윙크가 어려운 아이는 두 눈을 꼭 감아도 받아 준다.
    alt: (s) => Math.min(val(s, 'eyeBlinkLeft'), val(s, 'eyeBlinkRight')) > 0.5,
    keys: ['eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight'],
  },
};
const IDS = Object.keys(EMOTIONS);
const PRAISE = ['와, 똑같아요!', '멋진 표정이에요!', '최고예요!', '정말 잘했어요!'];
const CHEER = '조금 더 크게 해 볼까요? 잘하고 있어요!';

// ---- 표정 친구 그림 ----

// 동글동글 표정 얼굴. emo: EMOTIONS 의 이름 또는 'neutral'
export function emoFace(ctx, x, y, r, emo, t = 0, color = COLORS.yellow) {
  ctx.save();
  ctx.translate(x, y);
  const puff = emo === 'puff' ? 1.12 : 1;
  ctx.fillStyle = emo === 'angry' ? '#FF8C61' : color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * puff, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.45, -r * 0.55, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();

  const ink = COLORS.ink;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.08;
  const ex = r * 0.36;
  const ey = -r * 0.12;
  const dot = (sx, k = 1) => {
    ctx.beginPath();
    ctx.ellipse(sx, ey, r * 0.09 * k, r * 0.12 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const arcEye = (sx, up = true) => {
    ctx.beginPath();
    if (up) ctx.arc(sx, ey + r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(sx, ey - r * 0.05, r * 0.12, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  };
  const brow = (sx, tilt, lift = 0) => {
    // tilt > 0: 안쪽 끝이 올라감(슬픔), < 0: 안쪽 끝이 내려감(화남)
    const inner = -Math.sign(sx);
    ctx.beginPath();
    ctx.moveTo(sx - inner * r * 0.15, ey - r * 0.28 - lift + tilt * r * 0.06);
    ctx.lineTo(sx + inner * r * 0.15, ey - r * 0.28 - lift - tilt * r * 0.1);
    ctx.stroke();
  };
  const cheeks = (k = 1, alpha = 0.75) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS.cheek;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.6 * puff, r * 0.2, r * 0.13 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  switch (emo) {
    case 'happy': {
      arcEye(-ex);
      arcEye(ex);
      cheeks();
      // 활짝 웃는 입(혀)
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, r * 0.18);
      ctx.quadraticCurveTo(0, r * 0.75, r * 0.35, r * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FF7A90';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.4, r * 0.14, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'surprised': {
      for (const sx of [-ex, ex]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx, ey, r * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
        dot(sx, 0.8);
        // 동그랗게 치켜 올린 눈썹
        ctx.beginPath();
        ctx.arc(sx, ey - r * 0.2, r * 0.16, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.42, r * 0.15, r * 0.2 * (1 + Math.sin(t * 6) * 0.05), 0, 0, Math.PI * 2);
      ctx.fill();
      cheeks(0.8, 0.5);
      break;
    }
    case 'sad': {
      dot(-ex);
      dot(ex);
      brow(-ex, 1);
      brow(ex, 1);
      ctx.beginPath();
      ctx.arc(0, r * 0.6, r * 0.22, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      // 눈물 방울
      const drop = ((t * 0.8) % 1) * r * 0.35;
      ctx.fillStyle = '#4CC9F0';
      ctx.beginPath();
      ctx.moveTo(ex + r * 0.05, ey + r * 0.12 + drop);
      ctx.quadraticCurveTo(ex + r * 0.15, ey + r * 0.28 + drop, ex + r * 0.05, ey + r * 0.32 + drop);
      ctx.quadraticCurveTo(ex - r * 0.05, ey + r * 0.28 + drop, ex + r * 0.05, ey + r * 0.12 + drop);
      ctx.fill();
      break;
    }
    case 'angry': {
      dot(-ex, 0.9);
      dot(ex, 0.9);
      ctx.lineWidth = r * 0.1;
      brow(-ex, -1.4, -r * 0.04);
      brow(ex, -1.4, -r * 0.04);
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.moveTo(-r * 0.22, r * 0.45);
      ctx.quadraticCurveTo(0, r * 0.32, r * 0.22, r * 0.45);
      ctx.stroke();
      // 부글부글 김
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = r * 0.06;
      for (const side of [-1, 1]) {
        const k = Math.sin(t * 5 + side) * r * 0.03;
        ctx.beginPath();
        ctx.moveTo(side * r * 0.75, -r * 0.8 + k);
        ctx.quadraticCurveTo(side * r * 0.9, -r * 0.95, side * r * 0.8, -r * 1.1 + k);
        ctx.stroke();
      }
      break;
    }
    case 'kiss': {
      arcEye(-ex);
      arcEye(ex);
      cheeks(1.1, 0.85);
      // 쭉 내민 입술
      ctx.fillStyle = '#FF5A7A';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.38, r * 0.12, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#C93A57';
      ctx.lineWidth = r * 0.035;
      ctx.beginPath();
      ctx.moveTo(-r * 0.08, r * 0.38);
      ctx.lineTo(r * 0.08, r * 0.38);
      ctx.stroke();
      heart(ctx, r * 0.55, -r * 0.6 - ((t * 0.6) % 1) * r * 0.3, r * 0.16, COLORS.pink);
      break;
    }
    case 'puff': {
      dot(-ex * 1.05);
      dot(ex * 1.05);
      cheeks(1.9, 0.85);
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, r * 0.4);
      ctx.lineTo(r * 0.1, r * 0.4);
      ctx.stroke();
      break;
    }
    case 'wink': {
      dot(-ex);
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.13, ey - r * 0.08);
      ctx.lineTo(ex + r * 0.05, ey);
      ctx.lineTo(ex - r * 0.13, ey + r * 0.08);
      ctx.stroke();
      cheeks();
      ctx.beginPath();
      ctx.arc(0, r * 0.18, r * 0.25, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      star(ctx, r * 0.75, -r * 0.6, r * 0.14 * (1 + Math.sin(t * 6) * 0.15), '#fff');
      break;
    }
    default: {
      dot(-ex);
      dot(ex);
      cheeks(1, 0.5);
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, r * 0.38);
      ctx.lineTo(r * 0.15, r * 0.38);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 아이 얼굴 둘레의 귀여운 스티커 테두리(곰돌이 귀)
function faceFrame(ctx, f, color, progress, matched, t) {
  const cx = f.center.x;
  const cy = f.center.y;
  const rx = (f.box.x2 - f.box.x) * 0.68;
  const ry = (f.box.y2 - f.box.y) * 0.66;
  const lw = Math.max(4, rx * 0.09);
  ctx.save();
  // 테두리(성공하면 무지개빛으로 반짝)
  ctx.lineWidth = lw;
  ctx.strokeStyle = matched ? RAINBOW[Math.floor(t * 8) % RAINBOW.length] : color;
  ctx.setLineDash(matched ? [] : [lw * 2.2, lw * 1.2]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // 귀(테두리 위에 머리띠처럼)
  for (const side of [-1, 1]) {
    const ex = cx + side * rx * 0.72;
    const ey = cy - ry * 0.82;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ex, ey, rx * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD6E0';
    ctx.beginPath();
    ctx.arc(ex, ey, rx * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  // 유지 진행 표시
  if (progress > 0) {
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineWidth = lw * 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + lw * 1.2, ry + lw * 1.2, 0, -Math.PI / 2, -Math.PI / 2 + Math.min(1, progress) * Math.PI * 2);
    ctx.stroke();
  }
  if (matched) {
    for (let i = 0; i < 6; i++) {
      const a = t * 2 + (i * Math.PI) / 3;
      star(ctx, cx + Math.cos(a) * (rx + lw * 3), cy + Math.sin(a) * (ry + lw * 3), rx * 0.1, i % 2 ? '#fff' : COLORS.yellow);
    }
  }
  ctx.restore();
}

// 감정 얼굴 따라 하기: 표정 친구가 보여 주는 얼굴을 아이가 따라 한다.
export class FaceScene {
  tracker = 'face';
  showAvatar = false;
  hideCursor = true;
  hideTrail = true;

  constructor(game) {
    this.game = game;
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.charR = unit * 0.1;
    this.charX = z.x + z.w - this.charR * 1.35;
    this.charY = z.y + this.charR * 1.45;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.queue = [];
    this.emo = null;
    this.looks = []; // 얼굴마다 { progress, best, matched, base }
    this.cheerT = 0;
    this.after(speak('표정 친구를 똑같이 따라 해요!'), () => this.next());
  }

  exit() {
    this.active = false;
  }

  after(promise, fn) {
    const token = ++this.token;
    promise.then(() => {
      if (this.active && this.token === token) fn();
    });
  }

  next() {
    // 처음엔 쉬운 웃는 얼굴부터, 그다음은 섞어서(같은 표정이 연달아 나오지 않게)
    if (!this.queue.length) this.queue = this.emo === null ? ['happy', ...shuffle(IDS.filter((e) => e !== 'happy'))] : shuffle(IDS);
    if (this.queue[0] === this.emo) this.queue.push(this.queue.shift());
    this.emo = this.queue.shift();
    this.emoT = 0;
    this.cheered = false;
    for (const l of this.looks) l.progress = 0;
    this.state = 'play';
    sfx.peek();
    speak(EMOTIONS[this.emo].voice);
  }

  // 손 입력이 없는 놀이라 보호자·PC 테스트용으로 화면을 누르면 성공으로 친다.
  onTap() {
    if (this.state === 'play') this.success(null);
  }

  update(dt, input) {
    this.t += dt;
    this.cheerT = Math.max(0, this.cheerT - dt);
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    const faces = input.faces ?? [];
    this.faces = faces;

    // 얼굴은 화면 왼쪽부터 정렬되어 오므로 순서로 상태를 이어 간다.
    while (this.looks.length < faces.length) this.looks.push({ progress: 0, best: 'neutral', matched: false, base: null });
    this.looks.length = Math.max(faces.length, 0);
    faces.forEach((f, i) => this.read(this.looks[i], f.shapes ?? {}, dt));

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.next();
      }
      return;
    }
    if (this.state !== 'play') return;
    this.emoT += dt;
    const e = EMOTIONS[this.emo];
    const kind = e.hard ? 'hard' : 'normal';
    if (!this.cheered && this.emoT > EASY_AFTER[kind]) {
      this.cheered = true;
      speak(CHEER);
    }

    faces.forEach((f, i) => {
      const look = this.looks[i];
      look.matched = this.matches(f.shapes ?? {}, look);
      if (look.matched) look.progress += dt / HOLD;
      else look.progress = Math.max(0, look.progress - dt * 1.2);
    });
    const winner = this.looks.findIndex((l) => l.progress >= 1);
    if (winner >= 0) this.success(winner);
  }

  // 얼굴 하나의 '지금 표정'(스티커에 보여 줄 것)과 평소 표정 점수
  read(look, s, dt) {
    let best = 'neutral';
    let top = BADGE_MIN;
    for (const id of IDS) {
      const v = EMOTIONS[id].score(s);
      if (v > top) {
        top = v;
        best = id;
      }
    }
    look.best = best;
    // 무표정일 때만 평소 점수를 따라간다(표정을 짓는 동안 기준이 따라오지 않게).
    if (!look.base) look.base = { ...s };
    if (best === 'neutral') for (const k in s) look.base[k] = (look.base[k] ?? s[k]) + (s[k] - (look.base[k] ?? s[k])) * Math.min(1, dt * BASELINE_RATE);
  }

  matches(s, look) {
    const e = EMOTIONS[this.emo];
    const kind = e.hard ? 'hard' : 'normal';
    const easy = this.emoT > EASY_AFTER[kind];
    const v = e.score(s);
    if (v >= (easy ? EASY_SCALE : 1)) return true;
    if (easy && e.alt?.(s)) return true;
    // 오래 걸리면 관련 표정이 평소보다 크게 바뀌기만 해도 인정
    if (this.emoT > CHANGE_AFTER[kind] && look.base) return e.keys.some((k) => val(s, k) - (look.base[k] ?? 0) > CHANGE_MIN);
    return false;
  }

  success(index) {
    const { particles, unit } = this.game;
    const both = this.looks.length >= 2 && this.looks.every((l) => l.matched);
    this.state = 'done';
    this.cheerT = 1.6;
    this.winner = index;
    sfx.success();
    sfx.sparkle(0.15);
    const targets = index === null ? [] : both ? this.faces : [this.faces[index]];
    for (const f of targets) {
      particles.burst(f.center.x, f.center.y, { count: 36, colors: [COLORS.yellow, '#fff', COLORS.pink], speed: unit * 0.7, size: unit * 0.02, shape: 'star', gravity: 120 });
    }
    particles.burst(this.charX, this.charY, { count: 24, colors: RAINBOW, speed: unit * 0.5, size: unit * 0.016, gravity: 200 });
    this.pulse[this.score] = 1;
    this.score++;
    const all = this.score >= GOAL;
    const praise = both ? '둘 다 똑같아요! 최고예요!' : PRAISE[Math.floor(Math.random() * PRAISE.length)];
    this.after(speak(praise), () => {
      if (!all) return this.after(new Promise((r) => setTimeout(r, 300)), () => this.next());
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      speak('표정 놀이 대장! 정말 잘했어요!');
    });
  }

  draw(ctx) {
    const { unit } = this.game;
    const faces = this.faces ?? [];
    faces.forEach((f, i) => {
      const look = this.looks[i] ?? { progress: 0, best: 'neutral', matched: false };
      const won = this.state === 'done' && (this.winner === i || this.winner === null);
      const color = faces.length >= 2 ? PLAYER_COLORS[i % 2] : COLORS.orange;
      faceFrame(ctx, f, color, this.state === 'play' ? look.progress : 0, look.matched || won, this.t);
      // 지금 짓고 있는 표정을 작은 얼굴 배지로 보여 준다(성공하면 목표 표정)
      const rx = (f.box.x2 - f.box.x) * 0.68;
      const ry = (f.box.y2 - f.box.y) * 0.66;
      const br = Math.max(unit * 0.03, rx * 0.24);
      const emo = won ? this.emo : look.best;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.center.x + rx * 0.78, f.center.y + ry * 0.78, br * 1.15, 0, Math.PI * 2);
      ctx.fill();
      emoFace(ctx, f.center.x + rx * 0.78, f.center.y + ry * 0.78, br, emo, this.t);
    });

    if (this.emo && this.state !== 'intro') this.drawCharacter(ctx);
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }

  // 오른쪽 위 표정 친구: 목표 표정을 보여 주고, 성공하면 신나서 통통 뛴다.
  drawCharacter(ctx) {
    const { charX: x, charY: y, charR: r } = this;
    const cheer = this.cheerT > 0 || this.state === 'celebrate';
    const hop = cheer ? Math.abs(Math.sin(this.t * 9)) * r * 0.18 : Math.sin(this.t * 2.5) * r * 0.03;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y - hop);
    ctx.rotate(cheer ? Math.sin(this.t * 9) * 0.12 : 0);
    // 짧은 팔(성공하면 만세)
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.18;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.85, r * 0.3);
      ctx.lineTo(side * r * 1.2, cheer ? -r * 0.55 : r * 0.7);
      ctx.stroke();
    }
    emoFace(ctx, 0, 0, r, this.emo, this.t);
    ctx.restore();
    if (cheer) {
      for (let i = 0; i < 5; i++) {
        const a = this.t * 3 + (i * Math.PI * 2) / 5;
        star(ctx, x + Math.cos(a) * r * 1.45, y - hop + Math.sin(a) * r * 1.45, r * 0.15, i % 2 ? COLORS.pink : COLORS.yellow);
      }
    }
  }
}

// ---- 놀이 설명(동작 + 음성) ----
export const guide = {
  text: '표정 친구가 짓는 얼굴을 똑같이 따라 해요! 웃는 얼굴, 놀란 얼굴!',
  demo: (ctx, s, t) => {
    const list = ['happy', 'surprised', 'kiss', 'wink'];
    const period = 2.4;
    const emo = list[Math.floor(t / period) % list.length];
    const p = (t % period) / period;
    // 왼쪽: 표정 친구, 오른쪽: 따라 하는 아이 얼굴(스티커 테두리)
    emoFace(ctx, -s * 2.4, -s * 0.2, s * 1.5, emo, t);
    const follow = p > 0.4 ? emo : 'neutral';
    const f = { center: { x: s * 2.4, y: -s * 0.1 }, box: { x: s * 1.2, y: -s * 1.6, x2: s * 3.6, y2: s * 1.4 } };
    faceFrame(ctx, f, COLORS.orange, p > 0.4 ? Math.min(1, (p - 0.4) / 0.3) : 0, p > 0.7, t);
    emoFace(ctx, s * 2.4, -s * 0.1, s * 1.2, follow, t, '#FFD6A5');
    // 가운데 화살표
    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.moveTo(s * 0.55, -s * 0.2);
    ctx.lineTo(-s * 0.15, -s * 0.7);
    ctx.lineTo(-s * 0.15, s * 0.3);
    ctx.closePath();
    ctx.fill();
  },
};

// ---- 메뉴 아이콘: 표정이 바뀌는 얼굴 ----
export function menuIcon(ctx, r, t = 0) {
  const list = ['happy', 'surprised', 'wink', 'kiss'];
  const emo = list[Math.floor(t / 1.5) % list.length];
  emoFace(ctx, 0, r * 0.05, r * 0.6, emo, t);
}
