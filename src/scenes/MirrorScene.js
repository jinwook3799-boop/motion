import { progressRing, COLORS, RAINBOW } from '../engine/draw.js';
import { heart, starGauge } from '../engine/icons.js';
import { armPoint, shoulders, visible, P } from '../engine/pose.js';
import { sfx } from '../engine/audio.js';
import { speak } from '../engine/voice.js';
import { pick } from '../engine/util.js';
import { drawNeedTwo, firework, leftToRight, PLAYER_COLORS } from './common.js';

const GOAL = 6;
const HOLD = 1.2; // 똑같은 자세를 이만큼(초) 유지하면 성공
const MATCH_ANGLE = 0.6; // 팔 마디 방향 차이 평균이 이 값(라디안, 약 35도)보다 작으면 같은 자세
const PRAISE = ['똑같아요!', '거울 같아요!', '척척 맞았어요!'];

// 팔 네 마디(위팔·아래팔 × 왼쪽·오른쪽)
const SEGMENTS = [
  [P.lShoulder, P.lElbow],
  [P.lElbow, P.lWrist],
  [P.rShoulder, P.rElbow],
  [P.rElbow, P.rWrist],
];

const angleOf = (pose, a, b) => (visible(pose[a]) && visible(pose[b]) ? Math.atan2(pose[b].y - pose[a].y, pose[b].x - pose[a].x) : null);

// 두 아이의 팔 모양이 얼마나 같은지(마디 방향 차이 평균). 비교할 마디가 3개 미만이면 null
function difference(a, b) {
  const diffs = [];
  for (const [i, j] of SEGMENTS) {
    const x = angleOf(a, i, j);
    const y = angleOf(b, i, j);
    if (x === null || y === null) continue;
    diffs.push(Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y))));
  }
  return diffs.length >= 3 ? diffs.reduce((s, d) => s + d, 0) / diffs.length : null;
}

// 그냥 서 있는 자세가 아닌지(손을 들거나 옆으로 뻗었는지). 둘 다 가만히 서 있어도 성공하는 것을 막는다.
function isPosing(pose) {
  const sh = shoulders(pose);
  if (!sh) return false;
  return ['l', 'r'].some((side) => {
    const p = armPoint(pose, side);
    const s = side === 'l' ? sh.ls : sh.rs;
    return p && (p.y < sh.my - sh.sw * 0.1 || Math.abs(p.x - s.x) > sh.sw * 0.9);
  });
}

// 거울 놀이: 왕관 쓴 아이가 자세를 만들면 다른 아이가 똑같이 따라 한다. 성공하면 왕관이 넘어간다.
export class MirrorScene {
  tracker = 'pose';
  showAvatar = true;

  constructor(game) {
    this.game = game;
  }

  // 왕관 쓴 아이는 노랑, 따라 하는 아이는 파랑
  avatarColorOf(person) {
    return person.id === this.leaderId ? COLORS.yellow : PLAYER_COLORS[0];
  }

  enter() {
    this.active = true;
    this.token = 0;
    this.score = 0;
    this.pulse = new Array(GOAL).fill(0);
    this.leaderSide = 0; // 0 = 왼쪽 아이, 1 = 오른쪽 아이
    this.leaderId = null;
    this.hold = 0;
    this.waitVoiceT = 0;
    this.state = 'play';
    this.after(speak('왕관 친구부터 시작해요!'), () => {});
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

  onTap() {
    if (this.state === 'play') this.hold = HOLD;
  }

  update(dt, input) {
    for (let i = 0; i < GOAL; i++) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.5);
    const kids = leftToRight(input.people);
    this.kids = kids;

    if (this.state === 'celebrate') {
      this.stateT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.35;
        firework(this.game);
      }
      if (this.stateT <= 0) {
        this.score = 0;
        this.state = 'play';
      }
      return;
    }

    if (kids.length < 2) {
      this.leaderId = kids[0]?.id ?? null;
      this.hold = Math.max(0, this.hold - dt);
      this.waitVoiceT -= dt;
      if (this.waitVoiceT <= 0) {
        this.waitVoiceT = 10;
        this.after(speak('친구랑 둘이 나란히 서 주세요!'), () => {});
      }
      return;
    }
    const leader = kids[this.leaderSide];
    const follower = kids[1 - this.leaderSide];
    this.leaderId = leader.id;
    if (this.state !== 'play') return;

    const diff = difference(leader.pose, follower.pose);
    const ok = this.hold >= HOLD || (diff !== null && diff < MATCH_ANGLE && isPosing(leader.pose));
    this.hold = ok ? this.hold + dt : Math.max(0, this.hold - dt * 0.6);
    if (this.hold >= HOLD) this.success(leader);
  }

  success(leader) {
    this.hold = 0;
    this.pulse[this.score] = 1;
    this.score++;
    sfx.success();
    const { particles, unit } = this.game;
    particles.burst(leader.center.x, leader.center.y, { count: 40, colors: RAINBOW, speed: unit * 0.8, size: unit * 0.02, shape: 'confetti' });
    this.leaderSide = 1 - this.leaderSide; // 왕관을 넘긴다
    if (this.score >= GOAL) {
      this.state = 'celebrate';
      this.stateT = 3.5;
      this.fireT = 0;
      sfx.fanfare();
      this.after(speak('거울 놀이 최고! 둘이 마음이 척척 맞아요!'), () => {});
      return;
    }
    this.state = 'swap';
    this.after(speak(`${pick(PRAISE)} 이번엔 왕관이 친구에게 가요!`), () => (this.state = 'play'));
  }

  draw(ctx) {
    const { unit, w, zone: z } = this.game;
    const kids = this.kids ?? [];
    // 왕관 쓴 아이 머리 위 왕관
    const leader = kids.find((k) => k.id === this.leaderId);
    if (leader) {
      const nose = leader.pose[P.nose];
      const sh = shoulders(leader.pose);
      const size = (sh?.sw ?? unit * 0.15) * 0.6;
      const x = visible(nose, 0.3) ? nose.x : leader.center.x;
      const y = (visible(nose, 0.3) ? nose.y : leader.center.y - size * 2) - size * 1.6;
      crown(ctx, x, y + Math.sin(this.game.time * 3) * size * 0.08, size);
    }

    if (kids.length < 2 && this.state !== 'celebrate') drawNeedTwo(ctx, this.game, kids.length);
    else {
      // 위쪽 가운데: 똑같이 맞춘 시간만큼 하트가 차오른다.
      const x = w / 2;
      const y = z.y + unit * 0.12;
      const r = unit * 0.07;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      heart(ctx, x, y + r * 0.05, r * 0.55 * (1 + Math.min(1, this.hold / HOLD) * 0.25), COLORS.pink);
      progressRing(ctx, x, y, r, Math.min(1, this.hold / HOLD), COLORS.pink);
    }
    starGauge(ctx, this.game, GOAL, this.score, this.pulse);
  }
}

function crown(ctx, x, y, s) {
  ctx.fillStyle = COLORS.yellow;
  ctx.strokeStyle = '#F4A100';
  ctx.lineWidth = s * 0.08;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.5);
  ctx.lineTo(x - s, y - s * 0.4);
  ctx.lineTo(x - s * 0.5, y + s * 0.05);
  ctx.lineTo(x, y - s * 0.6);
  ctx.lineTo(x + s * 0.5, y + s * 0.05);
  ctx.lineTo(x + s, y - s * 0.4);
  ctx.lineTo(x + s, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const [dx, c] of [[-0.5, COLORS.red], [0, COLORS.blue], [0.5, COLORS.green]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + dx * s, y + s * 0.25, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}
