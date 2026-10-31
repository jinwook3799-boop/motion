// 빠른 손짓 보완: 손이 지난 프레임 위치(px, py)에서 지금 위치까지 지나간 길 전체로 닿았는지 판정한다.
// 카메라는 1초에 30장 정도라 아이가 손을 휙 휘두르면 두 장 사이에 풍선을 '건너뛰는' 일이 생기기 때문.
export function sweepDist(p, x, y) {
  if (p.px === undefined) return Math.hypot(p.x - x, p.y - y);
  const dx = p.x - p.px;
  const dy = p.y - p.py;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - p.px) * dx + (y - p.py) * dy) / len2)) : 1;
  return Math.hypot(p.px + dx * t - x, p.py + dy * t - y);
}

export const touches = (p, x, y, r) => sweepDist(p, x, y) < r;

// 지나간 길 위의 점들(처음 → 지금). 영역 판정(악기 등)에 쓴다.
export function sweepPoints(p, step) {
  if (p.px === undefined) return [p];
  const n = Math.min(12, Math.ceil(Math.hypot(p.x - p.px, p.y - p.py) / step));
  if (n <= 1) return [p];
  return Array.from({ length: n }, (_, i) => {
    const k = (i + 1) / n;
    return { x: p.px + (p.x - p.px) * k, y: p.py + (p.y - p.py) * k };
  });
}
