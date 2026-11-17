/* 지도 말풍선 문구 · 카메라 이동 규칙 (utils/dropBubble) */
import type { MusicDropSummary, PlaylistDropSummary, VoteDropSummary } from '@/api/types';
import { bubbleText, focusCamera, FOCUS_LNG_DELTA } from '@/utils/dropBubble';
import { lockMessage, type DropLock } from '@/utils/dropLock';

const base = { droppingId: 'd1', userId: 'u1', latitude: 35.18, longitude: 128.9, address: '부산 강서구', isMyDropping: false };
const music = (content: string): MusicDropSummary => ({ ...base, type: 'MUSIC', content, songId: 's1', title: '시간은 나를 기다려주지 않아', artist: '이범준', albumImageUrl: null });
const vote = (content: string): VoteDropSummary => ({ ...base, type: 'VOTE', content, topic: '퇴근길에 어울리는 곡은?', options: ['a', 'b', 'c'], firstAlbumImageUrl: null });
const playlist = (content: string): PlaylistDropSummary => ({ ...base, type: 'PLAYLIST', content, playlistName: '봉림동 퇴근길', songIds: ['a', 'b'], firstAlbumImageUrl: null });
const open: DropLock = { locked: false };
const far: DropLock = { locked: true, remainingM: 1043 };

test('한마디가 있으면 첫 줄은 따옴표 한마디, 둘째 줄은 닉네임 · 곡 제목', () => {
  expect(bubbleText(music(' 퇴근길에 여기서 들으면 딱이에요 '), { username: '물결러버', lock: open, lockMsg: '' })).toEqual({
    quote: '“퇴근길에 여기서 들으면 딱이에요”', title: null, sub: '물결러버 · 시간은 나를 기다려주지 않아', locked: false,
  });
});

test('닉네임을 아직 못 받았으면 빼고 제목만', () => {
  expect(bubbleText(music('좋아요'), { username: null, lock: open, lockMsg: '' }).sub).toBe('시간은 나를 기다려주지 않아');
});

test('한마디가 없으면(빈칸뿐이어도) 첫 줄은 곡 제목, 둘째 줄은 가수 · 닉네임', () => {
  expect(bubbleText(music('   '), { username: '물결러버', lock: open, lockMsg: '' })).toEqual({
    quote: null, title: '시간은 나를 기다려주지 않아', sub: '이범준 · 물결러버', locked: false,
  });
});

test('투표 드랍 — 한마디가 있으면 둘째 줄에 종류와 주제, 없으면 주제가 제목이고 후보 수', () => {
  expect(bubbleText(vote('다들 뭐 들어요?'), { username: '하윤', lock: open, lockMsg: '' }).sub).toBe('하윤 · 투표 · 퇴근길에 어울리는 곡은?');
  expect(bubbleText(vote(''), { username: null, lock: open, lockMsg: '' })).toEqual({ quote: null, title: '퇴근길에 어울리는 곡은?', sub: '투표 · 후보 3곡', locked: false });
});

test('플레이리스트 드랍 — 플리 제목과 곡 수', () => {
  expect(bubbleText(playlist('한 바퀴 돌면서'), { username: null, lock: open, lockMsg: '' })).toEqual({ quote: '“한 바퀴 돌면서”', title: null, sub: '플레이리스트 · 봉림동 퇴근길', locked: false });
  expect(bubbleText(playlist(''), { username: '지우', lock: open, lockMsg: '' }).sub).toBe('플레이리스트 · 2곡 · 지우');
});

test('잠긴 드랍 — 곡 제목·닉네임은 숨기고 한마디(없으면 잠긴 드랍) + 잠금 안내', () => {
  const msg = lockMessage(far);
  expect(msg).toBe('1.1km 더 가까이 가면 들을 수 있어요');
  expect(bubbleText(music('비 오는 날 이 다리 위에서'), { username: '물결러버', lock: far, lockMsg: msg })).toEqual({ quote: '“비 오는 날 이 다리 위에서”', title: null, sub: msg, locked: true });
  expect(bubbleText(vote(''), { username: '하윤', lock: far, lockMsg: msg })).toEqual({ quote: null, title: '잠긴 드랍', sub: msg, locked: true });
});

test('카메라 — 적당히 확대돼 있으면 가운데만 옮기고, 너무 넓게 보면 확대', () => {
  const pin = { latitude: 35.19, longitude: 128.91 };
  expect(focusCamera(pin, { latitude: 35, longitude: 128, latitudeDelta: 0.018, longitudeDelta: 0.012 })).toEqual({ center: pin });
  const zoomed = focusCamera(pin, { latitude: 35, longitude: 128, latitudeDelta: 0.15, longitudeDelta: 0.1 });
  if (!('region' in zoomed)) throw new Error('확대해야 한다');
  expect(zoomed.region).toMatchObject({ ...pin, longitudeDelta: FOCUS_LNG_DELTA });
  expect(zoomed.region.latitudeDelta).toBeCloseTo(FOCUS_LNG_DELTA * 1.5); // 화면 비율은 지금 그대로
  expect('region' in focusCamera(pin, null)).toBe(true);
});
