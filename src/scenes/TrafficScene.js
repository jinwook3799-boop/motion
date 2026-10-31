import { HoverButton } from '../engine/HoverButton.js';
import { playIcon, progressRing, star, COLORS, RAINBOW } from '../engine/draw.js';
import { buddy, trafficLight } from '../engine/icons.js';
import { music, sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';

const GOAL = 5;
const FREEZE_TIME = 3; // 얼음 상태로 버텨야 하는 시간(초)
const REACTION_GRACE = 0.9; // "얼음!"을 듣고 멈추기까지 봐주는 시간(초)
// 움직임 판정 기준. 화면 픽셀 중 이 비율 이상이 바뀌면 '움직였다'로 본다.
const MOVE_THRESHOLD = 0.035;
const MOVE_ALLOWANCE = 0.5; // 이 시간(초) 이상 움직여야 실패 → 살짝 흔들리는 건 봐준다

// 모듈 3. "멈춰!"와 "출발!" (신호등 놀이)
export class TrafficScene {
  tracker = 'pose';
  needsMotion = true;

  constructor(game) {
    this.game = game;
    this.startButton = new HoverButton({ drawIcon: playIcon, onActivate: () => this.go(), ringColor: COLORS.green });
  }

  onResize() {
    const { w, h, unit } = this.game;
    this.startButton.place(w / 2, h / 2, Math.min(unit * 0.18, w * 0.2));
  }

  enter() {
    this.state = 'ready';
    this.score = 0;
    this.phase = 0;
    this.slotPulse = new Array(GOAL).fill(0);
    speak('음악이 나오면 신나게 춤추고, 얼음! 하면 꽁꽁 멈춰요! 가운데 동그라미에 손을 올려 볼까요?');
  }

  exit() {
    music.stop();
  }

  onTap(x, y) {
    if (this.state === 'ready') this.startButton.tap(x, y);
  }

  go() {
    if (this.score >= GOAL) this.score = 0;
    this.state = 'go';
    this.stateT = 4 + Math.random() * 4;
    music.start();
    speak('출발!');
  }

  freeze() {
    this.state = 'stop';
    this.grace = REACTION_GRACE;
    this.stateT = FREEZE_TIME;
    this.moved = 0;
    music.stop();
    sfx.freeze();
    speak('얼음!');
  }

  update(dt, input) {
    for (let i = 0; i < GOAL; i++) this.slotPulse[i] = Math.max(0, this.slotPulse[i] - dt * 2.5);

    switch (this.state) {
      case 'ready':
        this.startButton.update(dt, input.pointers);
        break;
      case 'go':
        // 많이 움직일수록 친구도 신나게 춤춘다.
        this.phase += dt * (3 + Math.min(1, input.motion * 15) * 6);
        this.stateT -= dt;
        if (this.stateT <= 0) this.freeze();
        break;
      case 'stop':
        if (this.grace > 0) {
          this.grace -= dt;
          break;
        }
        this.stateT -= dt;
        if (input.motion > MOVE_THRESHOLD) this.moved += dt;
        if (this.moved > MOVE_ALLOWANCE) this.result(false);
        else if (this.stateT <= 0) this.result(true);
        break;
      case 'result':
        this.stateT -= dt;
        if (this.stateT <= 0) this.go();
        break;
      case 'celebrate':
        this.stateT -= dt;
        this.fireT -= dt;
        if (this.fireT <= 0) this.firework();
        if (this.stateT <= 0) this.go();
        break;
    }
  }

  result(success) {
    const { particles, unit } = this.game;
    const b = this.buddyPos;
    if (success) {
      this.slotPulse[this.score] = 1;
      this.score++;
      sfx.success();
      particles.burst(b.x, b.y, { count: 30, colors: ['#fff', '#A9DEF9', COLORS.yellow], speed: unit * 0.6, size: unit * 0.02, shape: 'star', gravity: 150 });
      if (this.score >= GOAL) {
        this.state = 'celebrate';
        this.stateT = 4;
        this.fireT = 0;
        sfx.fanfare();
        speak('꽁꽁 얼음 박사! 정말 잘했어요!');
        return;
      }
      speak('꽁꽁 잘 멈췄어요!');
    } else {
      sfx.oops();
      speak('앗, 움직였어요! 다시 해 볼까요?');
    }
    this.state = 'result';
    this.stateT = 2.4;
  }

  firework() {
    this.fireT = 0.35;
    const { zone: z, unit } = this.game;
    this.game.particles.burst(z.x + Math.random() * z.w, z.y + Math.random() * z.h * 0.6, { count: 36, colors: RAINBOW, speed: unit * 0.55, size: unit * 0.012, gravity: 150, life: 1.2 });
    sfx.pop();
  }

  get buddyPos() {
    const { zone: z, unit } = this.game;
    return { x: z.x + unit * 0.2, y: z.y + z.h * 0.55 };
  }

  get light() {
    if (this.state === 'go' || this.state === 'celebrate') return 'green';
    if (this.state === 'stop' || this.state === 'result') return 'red';
    return null;
  }

  draw(ctx) {
    const { w, h, unit, zone: z } = this.game;
    const light = this.light;

    // 배경 전체를 초록/빨강으로 바꿔 지금 상태를 한눈에 알게 한다.
    if (light) {
      ctx.fillStyle = light === 'green' ? 'rgba(59,206,172,0.35)' : 'rgba(255,90,95,0.35)';
      ctx.fillRect(0, 0, w, h);
    }

    if (this.state === 'ready') {
      this.startButton.draw(ctx);
    }

    const frozen = this.state === 'stop' || this.state === 'result';
    const b = this.buddyPos;
    buddy(ctx, b.x, b.y, unit * 0.1, this.phase, frozen);
    if (this.state === 'stop' && this.grace <= 0) {
      progressRing(ctx, b.x, b.y, unit * 0.16, 1 - this.stateT / FREEZE_TIME, '#8ECAE6');
    }

    trafficLight(ctx, z.x + z.w - unit * 0.14, z.y + z.h * 0.55, unit * 0.12, light);
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
