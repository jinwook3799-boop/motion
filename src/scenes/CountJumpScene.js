import { star, COLORS } from '../engine/draw.js';
import { apple, starGauge } from '../engine/icons.js';
import { kid } from '../engine/scenery.js';
import { rabbit } from '../engine/animals.js';
import { bodyHeight, perPerson } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { firework } from './common.js';

const ROUNDS = 5; // 이만큼 맞히면 별 게이지가 차고 크게 축하
// 단계별 숫자 범위. 한 판(5문제)을 마칠 때마다 다음 단계로, 마지막 단계는 계속 반복
const LEVELS = [
  [1, 5],
  [3, 8],
  [5, 10],
];
const MIN_GAP = 0.35; // 점프 사이 최소 간격(초). 두 아이가 같이 뛰거나 한 번 뛴 게 두 번 잡혀도 한 번만 센다
const IDLE_HINT = 7; // 이 시간(초) 동안 점프가 없으면 다시 안내
const FLY_TIME = 0.6; // 사과가 칸에서 바구니로 날아가는 시간(초)
const NEXT_PAUSE = 600; // 다 세고 다음 숫자까지 쉬는 시간(ms)
// 소리 내어 세기(하나, 둘…)와 "세 번"처럼 읽을 때의 우리말 수
const COUNT_WORDS = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const TIMES = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const PRAISE = ['잘했어요!', '최고예요!', '정말 잘 세요!', '멋져요!'];

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const loop = (t, period) => (t % period) / period;

// 수 세며 점프: 화면의 숫자만큼 펄쩍 뛰면 한 번 뛸 때마다 사과가 바구니에 쏙 들어간다.
export class CountJumpScene {
  tracker = 'pose';
  showAvatar = true;
  avatarColor = COLORS.orange;

  constructor(game) {
    this.game = game;
  }

  onResize() {
    const { unit, zone: z } = this.game;
    this.slotS = unit * 0.03; // 칸(사과) 크기
    this.basketW = unit * 0.2;
    this.basketX = z.x + z.w - this.basketW * 0.75;
    this.basketY = z.y + z.h - unit * 0.075;
    this.rabbitX = this.basketX - this.basketW * 1.05;
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.state = 'intro';
    this.t = 0;
    this.level = 0;
    this.rounds = 0;
    this.pulse = new Array(ROUNDS).fill(0);
    this.target = 0;
    this.count = 0;
    this.slotPulse = [];
    this.flying = [];
    this.basket = 0;
    this.lastJump = -Infinity;
    this.hopT = Infinity;
    this.heights = new Map();
    this.after(speak('숫자만큼 펄쩍펄쩍 뛰어요!'), () => this.newRound());
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

  newRound() {
    const [lo, hi] = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    let n = rand(lo, hi);
    if (n === this.target && hi > lo) n = n === hi ? lo : n + 1; // 같은 수가 연달아 나오지 않게
    this.target = n;
    this.count = 0;
    this.slotPulse = new Array(n).fill(0);
    this.flying = [];
    this.basket = 0;
    this.idleT = 0;
    this.state = 'count';
    this.showT = 0;
    sfx.peek();
    speak(`${TIMES[n - 1]} 번 뛰어요!`);
  }

  // 보호자·PC 테스트용: 화면을 누르면 한 번 뛴 것으로 센다.
  onTap() {
    this.jump();
  }

  update(dt, input) {
    this.t += dt;
    this.hopT += dt;
    if (this.showT !== undefined) this.showT += dt;
    for (let i = 0; i < ROUNDS; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    for (let i = 0; i < this.slotPulse.length; i++) this.slotPulse[i] = Math.max(0, this.slotPulse[i] - dt * 2.5);

    // 두 아이 중 누가 뛰어도 센다(아이마다 기준 높이를 따로 잰다).
    for (const p of perPerson(this.heights, input.people)) {
      const h = bodyHeight(p.state, p.pose, dt);
      if (h === 'up' && p.state.last !== 'up') this.jump();
      if (h) p.state.last = h;
    }

    // 날아가는 사과가 바구니에 닿으면 바구니 사과가 하나 늘어난다.
    for (const f of this.flying) {
      f.t += dt;
      if (f.t >= FLY_TIME && !f.landed) {
        f.landed = true;
        this.basket++;
        sfx.bloop();
        this.game.particles.burst(this.basketX, this.basketY - this.basketW * 0.3, {
          count: 8, colors: [COLORS.red, COLORS.yellow, '#fff'], speed: this.game.unit * 0.25, size: this.game.unit * 0.01, gravity: 300,
        });
      }
    }
    this.flying = this.flying.filter((f) => !f.landed);

    if (this.state === 'count') {
      this.idleT += dt;
      if (this.idleT > IDLE_HINT) {
        this.idleT = 0;
        const left = this.target - this.count;
        speak(this.count === 0 ? `${TIMES[this.target - 1]} 번 펄쩍! 뛰어 볼까요?` : `${TIMES[left - 1]} 번 더 뛰어요!`);
      }
    } else if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.rounds = 0;
        this.level++;
        this.newRound();
      }
    }
  }

  jump() {
    const now = this.game.time;
    if (now - this.lastJump < MIN_GAP) return;
    this.lastJump = now;
    this.hopT = 0;
    // 다 센 뒤에 더 뛰어도 세지 않는다(혼내지 않고 반짝이만).
    if (this.state !== 'count') {
      if (this.state === 'done') sfx.twinkle();
      return;
    }
    const i = this.count;
    this.count++;
    this.idleT = 0;
    this.slotPulse[i] = 1;
    const from = this.slotPos(i);
    this.flying.push({ x: from.x, y: from.y, t: 0, landed: false });
    sfx.jump();
    sfx.sparkle(0.05);
    const { particles, unit } = this.game;
    particles.burst(from.x, from.y, { count: 14, colors: [COLORS.yellow, '#fff', COLORS.red], speed: unit * 0.35, size: unit * 0.014, shape: 'star', gravity: 200 });

    const word = COUNT_WORDS[i];
    if (this.count < this.target) {
      speak(`${word}!`);
      return;
    }
    // 목표 수만큼 다 뛰었다!
    this.state = 'done';
    this.pulse[this.rounds] = 1;
    this.rounds++;
    sfx.success();
    const all = this.rounds >= ROUNDS;
    const n = this.target;
    this.after(speak(`${word}! ${TIMES[n - 1]} 번 뛰었어요! ${pick(PRAISE)}`), () => {
      if (all) return this.celebrate();
      this.after(new Promise((r) => setTimeout(r, NEXT_PAUSE)), () => this.newRound());
    });
  }

  celebrate() {
    this.state = 'celebrate';
    this.stateT = 3.5;
    this.fireT = 0;
    sfx.fanfare();
    speak('점프 숫자 박사! 정말 잘했어요!');
  }

  // ---- 그리기 ----

  // 칸 배치: 놀이 영역 왼쪽 위 세로 카드(아이 몸을 가리지 않게). 맨 위 큰 숫자, 그 아래 칸이
  // 5개씩 세로로(6개부터는 두 줄 — 십 칸 틀처럼). 집 버튼(왼쪽 아래)과 겹치지 않는 높이.
  layout() {
    const { unit, zone: z } = this.game;
    const n = Math.max(1, this.target);
    const S = this.slotS;
    const gap = S * 2.4;
    const cols = n > 5 ? 2 : 1;
    const rows = Math.min(5, n);
    const digitR = unit * 0.055;
    const cardW = Math.max(digitR * 2, cols * gap) + S * 1.2;
    const cardH = S * 0.6 + digitR * 2 + S * 0.4 + rows * gap + S * 0.4;
    return { n, S, gap, cols, rows, digitR, cardW, cardH, cardX: z.x + unit * 0.02, cardY: z.y + unit * 0.02 };
  }

  slotPos(i) {
    const L = this.layout();
    const col = Math.floor(i / 5);
    const row = i % 5;
    const x = L.cardX + L.cardW / 2 + (col - (L.cols - 1) / 2) * L.gap;
    const y = L.cardY + L.S * 0.6 + L.digitR * 2 + L.S * 0.4 + L.gap / 2 + row * L.gap;
    return { x, y };
  }

  draw(ctx) {
    if (this.state !== 'intro') this.drawCard(ctx);
    this.drawBasket(ctx);
    for (const f of this.flying) {
      const k = Math.min(1, f.t / FLY_TIME);
      const x = f.x + (this.basketX - f.x) * k;
      const y = f.y + (this.basketY - this.basketW * 0.25 - f.y) * k - Math.sin(k * Math.PI) * this.game.unit * 0.12;
      apple(ctx, x, y, this.slotS * (1 - k * 0.2));
    }
    starGauge(ctx, this.game, ROUNDS, this.rounds, this.pulse);
  }

  drawCard(ctx) {
    const L = this.layout();
    const { unit } = this.game;
    const appear = Math.min(1, (this.showT ?? 1) * 4);
    ctx.save();
    ctx.translate(L.cardX + L.cardW / 2, L.cardY + L.cardH / 2);
    ctx.scale(appear, appear);
    ctx.translate(-(L.cardX + L.cardW / 2), -(L.cardY + L.cardH / 2));
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.roundRect(L.cardX, L.cardY, L.cardW, L.cardH, L.cardW * 0.3);
    ctx.fill();

    // 큰 숫자
    const dx = L.cardX + L.cardW / 2;
    const dy = L.cardY + L.S * 0.6 + L.digitR;
    const done = this.state === 'done' || this.state === 'celebrate';
    const bump = done ? 1 + Math.abs(Math.sin(this.t * 6)) * 0.08 : 1;
    ctx.fillStyle = done ? COLORS.green : COLORS.orange;
    ctx.beginPath();
    ctx.arc(dx, dy, L.digitR * bump, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.round(L.digitR * (this.target >= 10 ? 1.15 : 1.45) * bump)}px "Noto Sans KR", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.target), dx, dy + L.digitR * 0.08);

    // 칸: 빈 칸은 점선 동그라미, 센 칸은 사과(가장 최근 칸은 통통 튄다)
    for (let i = 0; i < L.n; i++) {
      const p = this.slotPos(i);
      if (i < this.count) {
        apple(ctx, p.x, p.y + L.S * 0.15, L.S * (1 + (this.slotPulse[i] ?? 0) * 0.5));
      } else {
        const next = i === this.count && this.state === 'count';
        ctx.strokeStyle = next ? COLORS.orange : 'rgba(61,44,46,0.3)';
        ctx.lineWidth = unit * (next ? 0.007 : 0.005);
        ctx.setLineDash([unit * 0.012, unit * 0.009]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, L.S * (next ? 0.95 + Math.sin(this.t * 6) * 0.08 : 0.9), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // 오른쪽 아래 바구니(사과가 쌓인다)와 같이 뛰는 토끼
  drawBasket(ctx) {
    const { basketX: x, basketY: y, basketW: bw } = this;
    const s = this.slotS;
    // 바구니 속 사과(앞 테두리 뒤에 쌓인다)
    for (let i = 0; i < this.basket; i++) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const ax = x - bw * 0.36 + col * bw * 0.18 + (row % 2) * bw * 0.09;
      const ay = y - bw * 0.3 - row * s * 0.9;
      apple(ctx, ax, ay, s * 0.85);
    }
    ctx.fillStyle = '#C98B4F';
    ctx.strokeStyle = '#9C6B3A';
    ctx.lineWidth = bw * 0.03;
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.5, y - bw * 0.22);
    ctx.lineTo(x + bw * 0.5, y - bw * 0.22);
    ctx.lineTo(x + bw * 0.4, y + bw * 0.22);
    ctx.lineTo(x - bw * 0.4, y + bw * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 바구니 엮은 무늬
    ctx.strokeStyle = 'rgba(122,78,45,0.45)';
    for (let k = 1; k < 3; k++) {
      const yy = y - bw * 0.22 + (bw * 0.44 * k) / 3;
      ctx.beginPath();
      ctx.moveTo(x - bw * (0.5 - (0.1 * k) / 3), yy);
      ctx.lineTo(x + bw * (0.5 - (0.1 * k) / 3), yy);
      ctx.stroke();
    }
    ctx.fillStyle = '#E0A96D';
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.54, y - bw * 0.27, bw * 1.08, bw * 0.1, bw * 0.05);
    ctx.fill();

    // 토끼: 아이가 뛸 때마다 같이 깡충
    const hop = this.hopT < 0.5 ? Math.sin((this.hopT / 0.5) * Math.PI) * bw * 0.35 : 0;
    rabbit(ctx, this.rabbitX, y - bw * 0.05 - hop, bw * 0.28, this.t);
  }
}

// ---- 놀이 설명(동작 + 음성) ----
export const guide = {
  text: '숫자를 보고 그 수만큼 펄쩍펄쩍 뛰어요! 하나, 둘, 셋, 같이 세어요.',
  demo: (ctx, s, t) => {
    const N = 3;
    const period = 4.8;
    const p = loop(t, period) * period; // 0 ~ 4.8초
    // 0.6초부터 1초마다 한 번씩 점프, 세 번 뛰고 쉼
    const jumps = Math.max(0, Math.min(N, Math.floor((p - 0.6) / 1.0) + 1));
    const phase = (p - 0.6) % 1.0;
    const inAir = p > 0.6 && jumps <= N && p < 0.6 + N && phase < 0.45;
    const hop = inAir ? Math.sin((phase / 0.45) * Math.PI) * s * 0.9 : 0;

    // 숫자와 칸
    ctx.fillStyle = COLORS.orange;
    ctx.beginPath();
    ctx.arc(-s * 3.6, -s * 2.6, s * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${s * 1.1}px "Noto Sans KR", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(N), -s * 3.6, -s * 2.55);
    for (let i = 0; i < N; i++) {
      const x = -s * 2.1 + i * s * 1.2;
      const y = -s * 2.6;
      if (i < jumps) apple(ctx, x, y + s * 0.1, s * 0.38);
      else {
        ctx.strokeStyle = 'rgba(61,44,46,0.3)';
        ctx.lineWidth = s * 0.07;
        ctx.setLineDash([s * 0.15, s * 0.12]);
        ctx.beginPath();
        ctx.arc(x, y, s * 0.38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (jumps >= N && p > 0.6 + N - 0.55) {
      for (let i = 0; i < 5; i++) {
        const a = t * 2 + (i * Math.PI * 2) / 5;
        star(ctx, -s * 3.6 + Math.cos(a) * s * 1.05, -s * 2.6 + Math.sin(a) * s * 1.05, s * 0.18, COLORS.yellow);
      }
    }

    // 펄쩍 뛰는 친구
    kid(ctx, s * 0.2, s * 0.6 - hop, s, { hands: inAir ? [[-0.7, -1.9], [0.7, -1.9]] : [[-0.7, 0.4], [0.7, 0.4]] });
    // 바구니
    ctx.fillStyle = '#C98B4F';
    ctx.beginPath();
    ctx.moveTo(s * 2.4, s * 1.2);
    ctx.lineTo(s * 4.0, s * 1.2);
    ctx.lineTo(s * 3.8, s * 2.0);
    ctx.lineTo(s * 2.6, s * 2.0);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < jumps; i++) apple(ctx, s * 2.75 + i * s * 0.45, s * 1.05, s * 0.28);
    ctx.fillStyle = '#E0A96D';
    ctx.beginPath();
    ctx.roundRect(s * 2.3, s * 1.12, s * 1.8, s * 0.18, s * 0.09);
    ctx.fill();
  },
};

// ---- 메뉴 아이콘: 숫자와 펄쩍 뛰는 친구 ----
export function menuIcon(ctx, r, t = 0) {
  const hop = Math.abs(Math.sin(t * 3)) * r * 0.12;
  kid(ctx, -r * 0.3, r * 0.15 - hop, r * 0.24, { hands: hop > r * 0.06 ? [[-0.7, -1.9], [0.7, -1.9]] : [[-0.7, 0.4], [0.7, 0.4]] });
  ctx.fillStyle = COLORS.orange;
  ctx.beginPath();
  ctx.arc(r * 0.35, -r * 0.2, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${r * 0.45}px "Noto Sans KR", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('3', r * 0.35, -r * 0.17);
  apple(ctx, r * 0.38, r * 0.45, r * 0.15);
}
