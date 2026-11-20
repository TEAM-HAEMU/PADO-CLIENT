/**
 * 미리듣기 오디오 끊김 처리 규칙 (B-06) — 플랫폼 관례를 따른다.
 *  - focusLost: 다른 소리가 오디오 포커스를 가져감 (Android 전화·알람·다른 음악 앱). 재생 중이면 멈추고, 돌려받으면 이어 틀 곡으로 기억한다.
 *    react-native-video(Android)는 잠깐 잃을 때(AUDIOFOCUS_LOSS_TRANSIENT)는 이벤트만 내고 멈추지 않는다 → 여기서 멈춘다.
 *    아주 잃을 때(AUDIOFOCUS_LOSS)는 라이브러리가 스스로 멈추고 포커스를 놓아 다시 돌려받는 일이 없다 → 멈춘 상태만 화면에 맞춰진다.
 *  - focusGained: 포커스를 돌려받음 (통화가 끝남). 잠깐 잃어서 멈춘 그 곡이 아직 그대로 멈춰 있을 때만 이어서 튼다.
 *  - noisy: 이어폰·블루투스가 빠짐. 멈추고 이어 틀지 않는다 (스피커로 갑자기 소리가 나지 않게 — Android·iOS 공통 관례).
 * 사용자가 그 사이 직접 재생·일시정지하거나 다른 곡을 틀면 이어 틀 곡은 잊는다 (services/preview가 처리).
 */
export type AudioInterrupt = 'focusLost' | 'focusGained' | 'noisy';

export interface InterruptState { key: string | null; paused: boolean }
/** paused: 바꿀 일시정지 상태 (없으면 그대로), resumeKey: 포커스를 돌려받으면 이어 틀 곡 */
export interface InterruptResult { paused?: boolean; resumeKey: string | null }

export function interruptStep(s: InterruptState, resumeKey: string | null, ev: AudioInterrupt): InterruptResult {
  const playing = !!s.key && !s.paused;
  switch (ev) {
    case 'focusLost':
      // 이미 멈춘 곡이면 그대로 (잠깐 잃음이 두 번 와도 이어 틀 곡은 유지)
      return playing ? { paused: true, resumeKey: s.key } : { resumeKey };
    case 'noisy':
      return playing ? { paused: true, resumeKey: null } : { resumeKey: null };
    case 'focusGained':
      return resumeKey && s.key === resumeKey && s.paused ? { paused: false, resumeKey: null } : { resumeKey: null };
  }
}
