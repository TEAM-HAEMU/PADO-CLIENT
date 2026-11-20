/* B-06 — 전화(오디오 포커스)·이어폰 분리로 미리듣기를 멈추고, 잠깐 끊긴 것만 돌려받으면 이어 튼다 */
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native/Libraries/Settings/Settings', () => ({ __esModule: true, default: { get: () => undefined } }));
jest.mock('@/services/itunes', () => ({ findItunes: async () => ({ previewUrl: 'https://x/a.m4a' }) }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));
jest.mock('@/services/analytics', () => ({ track: jest.fn(), currentDropId: () => undefined }));

import { interruptStep } from '@/utils/audioInterrupt';
import { onAudioInterrupt, usePreviewStore } from '@/services/preview';
import { track } from '@/services/analytics';

describe('규칙', () => {
  const playing = { key: 'a', paused: false };
  const paused = { key: 'a', paused: true };

  test('포커스를 잃으면 재생 중인 곡을 멈추고 이어 틀 곡으로 기억한다', () => {
    expect(interruptStep(playing, null, 'focusLost')).toEqual({ paused: true, resumeKey: 'a' });
  });
  test('이미 멈춘 곡은 그대로 (이어 틀지 않음)', () => {
    expect(interruptStep(paused, null, 'focusLost')).toEqual({ resumeKey: null });
  });
  test('잠깐 잃음이 두 번 와도 이어 틀 곡은 유지', () => {
    expect(interruptStep(paused, 'a', 'focusLost')).toEqual({ resumeKey: 'a' });
  });
  test('돌려받으면 그 곡이 그대로 멈춰 있을 때만 이어서', () => {
    expect(interruptStep(paused, 'a', 'focusGained')).toEqual({ paused: false, resumeKey: null });
    expect(interruptStep({ key: 'b', paused: true }, 'a', 'focusGained')).toEqual({ resumeKey: null });
    expect(interruptStep(playing, 'a', 'focusGained')).toEqual({ resumeKey: null });
    expect(interruptStep(paused, null, 'focusGained')).toEqual({ resumeKey: null });
  });
  test('이어폰이 빠지면 멈추고 이어 틀지 않는다 (통화 중에 빠져도 통화 뒤 이어 틀지 않음)', () => {
    expect(interruptStep(playing, null, 'noisy')).toEqual({ paused: true, resumeKey: null });
    expect(interruptStep(paused, 'a', 'noisy')).toEqual({ resumeKey: null });
  });
  test('재생 중인 곡이 없으면 아무것도 하지 않는다', () => {
    expect(interruptStep({ key: null, paused: true }, null, 'focusLost')).toEqual({ resumeKey: null });
  });
});

describe('미리듣기 엔진', () => {
  const st = () => usePreviewStore.getState();
  beforeEach(() => { st().stop(); jest.clearAllMocks(); });

  test('전화가 오면 멈춰서 UI도 일시정지로, 끝나면 이어서 재생', () => {
    st().play('song-1', 'https://x/a.m4a');
    onAudioInterrupt('focusLost');
    expect(st().paused).toBe(true);
    expect(track).toHaveBeenCalledWith('preview_interrupted', expect.objectContaining({ song_id: 'song-1', reason: 'audio_focus' }));
    onAudioInterrupt('focusGained');
    expect(st().paused).toBe(false);
    expect(st().key).toBe('song-1');
  });

  test('통화 중에 사용자가 직접 재생·일시정지하면 통화 뒤 이어 틀지 않는다', () => {
    st().play('song-1', 'https://x/a.m4a');
    onAudioInterrupt('focusLost');
    st().toggle(); // 재생
    st().toggle(); // 다시 일시정지
    onAudioInterrupt('focusGained');
    expect(st().paused).toBe(true);
  });

  test('통화 중에 다른 곡을 틀었으면 돌려받아도 건드리지 않는다', () => {
    st().play('song-1', 'https://x/a.m4a');
    onAudioInterrupt('focusLost');
    st().play('song-2', 'https://x/b.m4a');
    st().toggle(); // song-2 일시정지
    onAudioInterrupt('focusGained');
    expect(st().key).toBe('song-2');
    expect(st().paused).toBe(true);
  });

  test('이어폰이 빠지면 멈추고, 포커스 이벤트가 와도 다시 틀지 않는다', () => {
    st().play('song-1', 'https://x/a.m4a');
    onAudioInterrupt('noisy');
    expect(st().paused).toBe(true);
    onAudioInterrupt('focusGained');
    expect(st().paused).toBe(true);
  });

  test('멈춰 있던 곡은 전화가 끝나도 틀지 않는다', () => {
    st().play('song-1', 'https://x/a.m4a');
    st().toggle();
    onAudioInterrupt('focusLost');
    onAudioInterrupt('focusGained');
    expect(st().paused).toBe(true);
    expect(track).not.toHaveBeenCalledWith('preview_interrupted', expect.anything());
  });
});
