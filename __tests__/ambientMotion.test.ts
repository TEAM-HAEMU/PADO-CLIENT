/* 반복 장식 애니메이션을 돌릴 때 — 보이고 재생 중일 때만, 물결 레이어는 잰 기준이 바뀌면 다시 잰다 */
import { ambientRunning, isPlaying, rippleToken } from '@/utils/ambientMotion';

describe('ambientRunning', () => {
  it('보이고 재생 중일 때만 돈다', () => {
    expect(ambientRunning({ visible: true, playing: true })).toBe(true);
    expect(ambientRunning({ visible: true, playing: false })).toBe(false);
    expect(ambientRunning({ visible: false, playing: true })).toBe(false);
  });
  it('always는 재생과 상관없이 보일 때만', () => {
    expect(ambientRunning({ visible: true, playing: false, always: true })).toBe(true);
    expect(ambientRunning({ visible: false, playing: false, always: true })).toBe(false);
  });
});

describe('isPlaying', () => {
  it('곡이 있고 일시정지가 아닐 때', () => {
    expect(isPlaying({ key: 's1', paused: false })).toBe(true);
    expect(isPlaying({ key: 's1', paused: true })).toBe(false);
    expect(isPlaying({ key: null, paused: false })).toBe(false);
  });
});

describe('rippleToken', () => {
  const view = { latitude: 35.1, longitude: 128.9, latitudeDelta: 0.018, longitudeDelta: 0.012 };
  const pins = [{ id: 'a', latitude: 35.1, longitude: 128.9, active: true }];
  it('같은 핀·같은 영역이면 같다', () => {
    expect(rippleToken(pins, view)).toBe(rippleToken([{ ...pins[0] }], { ...view }));
  });
  it('지도가 다른 곳에 멈추거나 · 핀이나 가장 가까운 핀이 바뀌면 달라진다', () => {
    const t = rippleToken(pins, view);
    expect(rippleToken(pins, { ...view, latitude: 35.2 })).not.toBe(t);
    expect(rippleToken(pins, { ...view, latitudeDelta: 0.03 })).not.toBe(t);
    expect(rippleToken([{ ...pins[0], active: false }], view)).not.toBe(t);
    expect(rippleToken([...pins, { id: 'b', latitude: 35.11, longitude: 128.91, active: false }], view)).not.toBe(t);
    expect(rippleToken(pins, null)).not.toBe(t);
  });
});
