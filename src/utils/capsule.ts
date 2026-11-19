/**
 * 위쪽이 반원인 알약(캡슐) 안에 글자를 올릴 때, 그 높이에서 실제로 보이는 폭.
 * 알약은 borderRadius = 폭/2 + overflow: hidden이라 위쪽 반원 밖은 잘린다.
 * 가운데 정렬한 한 줄을 알약 전체 폭으로 두면 긴 글은 앞·뒤(첫 글자, 아이콘, …)가 반원 밖으로 나가 안 보인다.
 * width·top은 모두 잘리는 안쪽 영역(테두리 안쪽) 기준. 네이티브 의존 없음 (jest에서 바로 시험)
 */

/**
 * 폭 width인 알약의 위 끝에서 y만큼 내려온 높이의 가로 현 길이.
 * 반지름 r = width/2, 현 = 2·√(r² − (r−y)²). 반원 아래(y ≥ r)는 알약 폭 그대로.
 */
export function capsuleChord(width: number, y: number): number {
  if (!(width > 0) || !(y > 0)) return 0;
  const r = width / 2;
  if (y >= r) return width;
  return 2 * Math.sqrt(r * r - (r - y) * (r - y));
}

/**
 * 위 끝이 top인 글자 한 줄에 줄 수 있는 최대 폭 — 그 줄의 위 끝(가장 좁은 곳)의 현에서 양옆 inset씩 뺀다.
 */
export function capsuleLineWidth(width: number, top: number, inset = 12): number {
  return Math.max(0, Math.floor(capsuleChord(width, top) - inset * 2));
}

/**
 * 위 끝이 top, 높이 height인 양 끝 둥근 작은 알약(주소 칩 등)의 최대 폭.
 * 양 끝 반원(반지름 height/2)이 큰 반원 안쪽으로 margin 이상 떨어지게 한다 —
 * 모서리가 이미 둥글어서 위 끝 현으로 재면 실제보다 훨씬 좁게 잡힌다.
 */
export function capsulePillWidth(width: number, top: number, height: number, margin = 6): number {
  if (!(width > 0) || !(top >= 0) || !(height > 0)) return 0;
  const R = width / 2;
  const rc = height / 2;
  const dy = R - (top + rc); // 큰 원 중심 → 끝 반원 중심 (세로)
  const reach = R - rc - margin; // 끝 반원 중심이 갈 수 있는 거리
  if (reach <= 0) return 0;
  if (dy <= 0) return Math.max(0, Math.floor(width - margin * 2)); // 반원 아래 — 옆 벽만
  if (dy >= reach) return 0;
  return Math.floor(2 * (rc + Math.sqrt(reach * reach - dy * dy)));
}
