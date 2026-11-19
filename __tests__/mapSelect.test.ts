/* 지도에서 드랍 고르기 — 도착 영역 · 이동 중 다시 고르기 생략 · 도착 뒤 핀 크기·말풍선 · 거리 없는 핀 문구 */
import type { DropSummary } from '@/api/types';
import { needsRepick } from '@/utils/mapPins';
import { alreadyThere, focusMove, pinSubtitle, regionOfBounds, repickWhileMoving, selectionLook } from '@/utils/mapSelect';

const view = { latitude: 35.1575, longitude: 129.0604, latitudeDelta: 0.018, longitudeDelta: 0.012 };
const pin = { latitude: 35.17, longitude: 129.07 };

describe('focusMove — 고른 드랍으로 옮길 카메라와 도착 영역', () => {
  test('알맞은 확대 수준이면 가운데만 옮기고, 도착 영역은 지금 크기 그대로 그 드랍 가운데', () => {
    const m = focusMove(pin, view);
    expect(m.camera).toEqual({ center: pin });
    expect(m.dest).toEqual({ ...view, ...pin });
  });
  test('너무 넓게 보고 있거나 영역을 모르면 확대한 영역 = 도착 영역', () => {
    const wide = focusMove(pin, { ...view, latitudeDelta: 0.15, longitudeDelta: 0.1 });
    expect('region' in wide.camera && wide.camera.region).toEqual(wide.dest);
    expect(wide.dest.longitudeDelta).toBeLessThan(0.1);
    const unknown = focusMove(pin, null);
    expect('region' in unknown.camera).toBe(true);
    expect(unknown.dest.latitude).toBe(pin.latitude);
  });
});

describe('alreadyThere', () => {
  test('카메라 가운데가 이미 그 드랍이면 (움직이지 않으므로 바로 도착)', () => {
    expect(alreadyThere({ ...view, ...pin }, pin)).toBe(true);
    expect(alreadyThere({ ...view, ...pin }, { latitude: pin.latitude + view.latitudeDelta * 0.001, longitude: pin.longitude })).toBe(true);
  });
  test('조금이라도 떨어져 있거나 영역을 모르면 아니다', () => {
    expect(alreadyThere(view, pin)).toBe(false);
    expect(alreadyThere({ ...view, ...pin }, { latitude: pin.latitude + view.latitudeDelta * 0.01, longitude: pin.longitude })).toBe(false);
    expect(alreadyThere(null, pin)).toBe(false);
  });
});

describe('repickWhileMoving — 앱이 카메라를 옮기는 동안엔 다시 고르지 않는다', () => {
  const far = { ...view, latitude: view.latitude + 0.1 }; // 지금 그린 범위를 한참 벗어남
  test('보통 이동(손으로 끌기)은 needsRepick 그대로', () => {
    expect(needsRepick(view, far)).toBe(true);
    expect(repickWhileMoving(view, far, { autoUntil: null, now: 1000 })).toBe(true);
    expect(repickWhileMoving(view, view, { autoUntil: null, now: 1000 })).toBe(false);
  });
  test('앱이 옮기는 중이면 빈 곳이 보여도 건너뛴다 (도착 영역으로 미리 골랐다)', () => {
    expect(repickWhileMoving(view, far, { autoUntil: 2000, now: 1000 })).toBe(false);
    expect(repickWhileMoving(view, { ...view, longitudeDelta: 0.1, latitudeDelta: 0.15 }, { autoUntil: 2000, now: 1000 })).toBe(false); // 핀↔묶음이 바뀌어도
  });
  test('사용자가 손으로 잡거나 · 이동 시간이 지나면 다시 고른다 (#24: 축소하는 동안에도 핀·묶음이 따라 나오게)', () => {
    expect(repickWhileMoving(view, far, { autoUntil: 2000, now: 1000, isGesture: true })).toBe(true);
    expect(repickWhileMoving(view, far, { autoUntil: 2000, now: 2000 })).toBe(true);
    expect(repickWhileMoving(view, far, { autoUntil: 0, now: 1000 })).toBe(true);
  });
  test('지금 묶음인지(clustered)를 넘기면 경계 여유를 쓴다', () => {
    const band = { ...view, longitudeDelta: 0.036, latitudeDelta: 0.054 };
    const wider = { ...band, longitudeDelta: 0.042, latitudeDelta: 0.063 };
    expect(repickWhileMoving(wider, band, { autoUntil: null, now: 1000, clustered: true })).toBe(false);
    expect(repickWhileMoving(band, wider, { autoUntil: null, now: 1000, clustered: false })).toBe(true);
  });
});

describe('selectionLook — 핀 크기·말풍선은 카메라가 도착한 뒤에', () => {
  test('아무것도 안 골랐으면 가장 가까운 열린 핀이 크고 말풍선은 없다', () => {
    expect(selectionLook(null, null, 'near')).toEqual({ activeId: 'near', bubbleId: null });
    expect(selectionLook(null, null, undefined)).toEqual({ activeId: undefined, bubbleId: null });
  });
  test('누른 직후(옮겨 가는 중)엔 크기를 바꾸지 않고 말풍선도 아직', () => {
    expect(selectionLook('b', null, 'near')).toEqual({ activeId: 'near', bubbleId: null });
  });
  test('도착하면 고른 핀이 크고 말풍선이 뜬다', () => {
    expect(selectionLook('b', 'b', 'near')).toEqual({ activeId: 'b', bubbleId: 'b' });
  });
  test('다른 드랍으로 옮겨 가는 동안 전에 고른 핀은 그대로 크고, 전 말풍선은 닫힌다', () => {
    expect(selectionLook('c', 'b', 'near')).toEqual({ activeId: 'b', bubbleId: null });
  });
});

describe('pinSubtitle — 핀 문구에 거리를 넣지 않는다 (GPS 갱신마다 핀 memo가 깨지지 않게)', () => {
  const base = { droppingId: 'x', userId: 'u', latitude: 35, longitude: 129, address: '', content: '', isMyDropping: false };
  const music = { ...base, type: 'MUSIC', songId: 's', title: '곡', artist: '가수', albumImageUrl: null } as unknown as DropSummary;
  const vote = { ...base, type: 'VOTE', topic: '투표', options: ['a', 'b', 'c'] } as unknown as DropSummary;
  const playlist = { ...base, type: 'PLAYLIST', playlistName: '플리', songIds: ['a', 'b'] } as unknown as DropSummary;
  test('음악은 가수, 투표·플리는 종류 · 곡 수', () => {
    expect(pinSubtitle(music, false)).toBe('가수');
    expect(pinSubtitle(vote, false)).toBe('투표 · 3곡');
    expect(pinSubtitle(playlist, false)).toBe('플레이리스트 · 2곡');
  });
  test('잠긴 핀은 곡 정보도 거리도 없이 안내만', () => {
    const s = pinSubtitle(music, true);
    expect(s).not.toContain('가수');
    expect(s).not.toMatch(/\d/);
  });
  test('어느 경우에도 거리(m·km)가 없다', () => {
    for (const d of [music, vote, playlist]) for (const locked of [false, true]) expect(pinSubtitle(d, locked)).not.toMatch(/\d+(\.\d+)?\s*(m|km)\b|바로 여기/);
  });
});

describe('regionOfBounds — 지도에서 읽은 보이는 범위 → 영역 (가려졌다 돌아올 때 view 맞추기, QA R-10 후속)', () => {
  it('가운데와 폭을 계산한다', () => {
    const r = regionOfBounds({ northEast: { latitude: 35.1984, longitude: 128.9098 }, southWest: { latitude: 35.1770, longitude: 128.8978 } });
    expect(r?.latitude).toBeCloseTo(35.1877);
    expect(r?.longitude).toBeCloseTo(128.9038);
    expect(r?.latitudeDelta).toBeCloseTo(0.0214);
    expect(r?.longitudeDelta).toBeCloseTo(0.012);
  });
  it('날짜변경선을 넘으면 경도 폭에 360을 더하고 가운데를 -180~180으로', () => {
    const r = regionOfBounds({ northEast: { latitude: 10, longitude: -170 }, southWest: { latitude: 0, longitude: 170 } });
    expect(r?.longitudeDelta).toBeCloseTo(20);
    expect(Math.abs(r!.longitude)).toBeCloseTo(180);
  });
  it('값이 비정상이면 null — 영역을 덮어쓰지 않는다', () => {
    expect(regionOfBounds(null)).toBeNull();
    expect(regionOfBounds({ northEast: { latitude: NaN, longitude: 1 }, southWest: { latitude: 0, longitude: 0 } })).toBeNull();
    expect(regionOfBounds({ northEast: { latitude: 1, longitude: 1 }, southWest: { latitude: 1, longitude: 0 } })).toBeNull();
  });
});
