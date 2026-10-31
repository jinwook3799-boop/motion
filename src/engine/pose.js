// MediaPipe Pose 랜드마크 번호
export const P = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lIndex: 19,
  rIndex: 20,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
};

const BONES = [
  [P.lShoulder, P.rShoulder],
  [P.lShoulder, P.lElbow],
  [P.lElbow, P.lWrist],
  [P.rShoulder, P.rElbow],
  [P.rElbow, P.rWrist],
  [P.lShoulder, P.lHip],
  [P.rShoulder, P.rHip],
  [P.lHip, P.rHip],
  [P.lHip, P.lKnee],
  [P.lKnee, P.lAnkle],
  [P.rHip, P.rKnee],
  [P.rKnee, P.rAnkle],
];

export const visible = (p, min = 0.5) => !!p && p.v >= min;

// 어깨 정보. 화면상 거리 기준값(sw)으로 아이 크기·거리에 상관없이 판정한다.
export function shoulders(pose) {
  const ls = pose[P.lShoulder];
  const rs = pose[P.rShoulder];
  if (!visible(ls) || !visible(rs)) return null;
  return {
    ls,
    rs,
    mx: (ls.x + rs.x) / 2,
    my: (ls.y + rs.y) / 2,
    sw: Math.max(20, Math.hypot(ls.x - rs.x, ls.y - rs.y)),
  };
}

// 손(안 보이면 팔꿈치) 위치. side: 'l' | 'r'
export function armPoint(pose, side) {
  const [w, e] = side === 'l' ? [P.lWrist, P.lElbow] : [P.rWrist, P.rElbow];
  if (visible(pose[w], 0.4)) return pose[w];
  if (visible(pose[e], 0.4)) return pose[e];
  return null;
}

// 서 있을 때 어깨 높이를 기준으로 지금 'up'(점프) / 'down'(쪼그려 앉음) / 'stand' 인지.
// s 는 호출하는 쪽이 들고 있는 상태 객체. 기준 높이는 서 있을 때만 천천히 따라간다.
export function bodyHeight(s, pose, dt) {
  const sh = shoulders(pose);
  if (!sh) return null;
  s.base ??= sh.my;
  const d = (sh.my - s.base) / sh.sw; // 음수면 평소보다 높음
  const state = d < -0.2 ? 'up' : d > 0.45 ? 'down' : 'stand';
  if (state === 'stand') s.base += (sh.my - s.base) * Math.min(1, dt * 1.5);
  // 카메라 쪽으로 다가오는 등 자세가 오래 바뀌면 기준을 새로 잡는다.
  s.stuck = state === 'stand' ? 0 : (s.stuck ?? 0) + dt;
  if (s.stuck > 3) {
    s.base = sh.my;
    s.stuck = 0;
  }
  return state;
}

// 무릎을 엉덩이 높이 가까이 들어 올렸는지. 다리가 안 보이면 null
export function kneeUp(pose, side) {
  const sh = shoulders(pose);
  const [hip, knee] = side === 'l' ? [pose[P.lHip], pose[P.lKnee]] : [pose[P.rHip], pose[P.rKnee]];
  if (!sh || !visible(hip) || !visible(knee)) return null;
  return knee.y - hip.y < sh.sw * 0.75;
}

export const legsVisible = (pose) => [P.lKnee, P.rKnee].every((i) => visible(pose[i]));

// 아이 몸 위에 그려 주는 동글동글 아바타(PRD 모듈 2의 '아동 실루엣')
export function drawAvatar(ctx, pose, color) {
  const sh = shoulders(pose);
  if (!sh) return;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = sh.sw * 0.3;
  for (const [a, b] of BONES) {
    const pa = pose[a];
    const pb = pose[b];
    if (!visible(pa) || !visible(pb)) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  for (const i of [P.lWrist, P.rWrist]) {
    if (!visible(pose[i])) continue;
    ctx.beginPath();
    ctx.arc(pose[i].x, pose[i].y, sh.sw * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
