/* 프로필 미니 지도 핀 상한 — 최신 드랍부터 자르기 위한 정렬 (만든 시각이 없으면 서버 순서 유지) */
import { newestFirst } from '@/utils/dropOrder';

const d = (id: string, createdAt?: string | null) => ({ id, createdAt });
const ids = (list: readonly { id: string }[]) => list.map(x => x.id);

test('모두 만든 시각이 있으면 최신순', () => {
  expect(ids(newestFirst([d('a', '2026-11-01T10:00:00Z'), d('b', '2026-11-03T10:00:00Z'), d('c', '2026-11-02T10:00:00Z')]))).toEqual(['b', 'c', 'a']);
});

test('시각이 같으면 원래 순서 유지', () => {
  expect(ids(newestFirst([d('a', '2026-11-01T10:00:00Z'), d('b', '2026-11-01T10:00:00Z')]))).toEqual(['a', 'b']);
});

test('하나라도 시각이 없거나 읽을 수 없으면 서버 순서 그대로', () => {
  expect(ids(newestFirst([d('a', '2026-11-01T10:00:00Z'), d('b'), d('c', '2026-11-03T10:00:00Z')]))).toEqual(['a', 'b', 'c']);
  expect(ids(newestFirst([d('a', 'not-a-date'), d('b', '2026-11-03T10:00:00Z')]))).toEqual(['a', 'b']);
  expect(ids(newestFirst([d('a', null), d('b', null)]))).toEqual(['a', 'b']);
});

test('정렬 뒤 앞에서 자르면 최신 N개', () => {
  const list = Array.from({ length: 40 }, (_, i) => d(`x${i}`, new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString()));
  expect(ids(newestFirst(list).slice(0, 3))).toEqual(['x39', 'x38', 'x37']);
});
