/* 드랍 상세 화면 고르기 — 타입이 다른 딥링크(pado://vote/<음악 드랍>)는 맞는 화면으로 replace, 모양을 모르면 '찾을 수 없어요' (QA 2026-11-20 B-01) */
import { errorMessage } from '@/api/errors';
import type { DropDetail } from '@/api/types';
import { dropScreenOf, useDropScreen, type DropScreen } from '@/navigation/dropScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const common = { droppingId: 'd1', userId: 'u1', content: '', latitude: 0, longitude: 0, address: '', expiryDate: '', createdAt: '' };
const MUSIC = { droppingId: 'd1', songId: 's1', userId: 'u1', username: 'a', content: '', expiryDate: '', createdAt: '', albumImageUrl: null } as unknown as DropDetail;
const VOTE = { ...common, topic: '어떤 곡?', options: [], totalVotes: 0, userVotedOption: null } as unknown as DropDetail;
const PLAYLIST = { ...common, playlistName: '퇴근길', songs: [] } as unknown as DropDetail;
const UNKNOWN = { ...common } as unknown as DropDetail;

test('응답 모양 → 화면', () => {
  expect(dropScreenOf(MUSIC)).toBe('PinPreview');
  expect(dropScreenOf(VOTE)).toBe('VoteDrop');
  expect(dropScreenOf(PLAYLIST)).toBe('PlaylistDrop');
  // 서버가 빈 필드를 null로 줘도 (topic null이면 투표 아님)
  expect(dropScreenOf({ ...(MUSIC as object), topic: null } as unknown as DropDetail)).toBe('PinPreview');
  expect(dropScreenOf(UNKNOWN)).toBeNull();
});

function mount(here: DropScreen, data: DropDetail | undefined) {
  const replace = jest.fn();
  const out = { error: undefined as unknown };
  const Probe = ({ d }: { d: DropDetail | undefined }) => { out.error = useDropScreen(here, { replace }, 'd1', d, 'link').error; return null; };
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Probe, { d: data })); });
  return { replace, out, update: (d: DropDetail | undefined) => act(() => { r.update(React.createElement(Probe, { d })); }), unmount: () => act(() => r.unmount()) };
}

test.each([
  ['VoteDrop', MUSIC, 'PinPreview'],
  ['PlaylistDrop', VOTE, 'VoteDrop'],
  ['VoteDrop', PLAYLIST, 'PlaylistDrop'],
  ['PinPreview', VOTE, 'VoteDrop'],
  ['PinPreview', PLAYLIST, 'PlaylistDrop'],
] as const)('%s 화면에 다른 타입 드랍 → 맞는 화면으로 replace', (here, data, target) => {
  const m = mount(here, data);
  expect(m.replace).toHaveBeenCalledTimes(1);
  expect(m.replace).toHaveBeenCalledWith(target, { dropId: 'd1', source: 'link' });
  expect(m.out.error).toBeUndefined();
  m.unmount();
});

test('맞는 타입이거나 아직 응답 전이면 그대로', () => {
  const m = mount('VoteDrop', undefined);
  expect(m.replace).not.toHaveBeenCalled();
  expect(m.out.error).toBeUndefined();
  m.update(VOTE);
  expect(m.replace).not.toHaveBeenCalled();
  expect(m.out.error).toBeUndefined();
  m.unmount();
});

test('모양을 알 수 없으면 replace 없이 찾을 수 없어요 오류 (로딩이 끝나지 않던 문제)', () => {
  const m = mount('PlaylistDrop', UNKNOWN);
  expect(m.replace).not.toHaveBeenCalled();
  expect(errorMessage(m.out.error)).toBe('드랍을 찾을 수 없어요. 만료됐거나 삭제된 드랍이에요.');
  m.unmount();
});
