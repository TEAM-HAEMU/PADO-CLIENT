import { useScreenVisible } from '@/hooks/useScreenVisible';
import { usePreviewStore } from '@/services/preview';
import { ambientRunning, isPlaying } from '@/utils/ambientMotion';

/**
 * 반복 장식 애니메이션을 지금 돌려도 되는가 — 이 화면이 보이고 미리듣기가 재생 중일 때만 (utils/ambientMotion).
 * always: 재생과 상관없이 보일 때 계속 (소개·로그인 화면)
 */
export function useAmbientMotion(always = false) {
  const visible = useScreenVisible();
  const playing = usePreviewStore(isPlaying);
  return ambientRunning({ visible, playing, always });
}
