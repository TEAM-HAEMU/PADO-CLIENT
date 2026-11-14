/**
 * drop_opened — 드랍 상세(음악 미리보기·투표·플리)가 열려 내용을 받았을 때 화면마다 한 번.
 * 거리는 상세 응답(투표·플리) 또는 주변·내 드랍 목록에 있는 좌표로 잰다 (모르면 null). 정밀 위치 자체는 보내지 않는다.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DropDetail, DropSummary } from '@/api/types';
import type { DropOpenSource } from '@/navigation/types';
import { track } from '@/services/analytics';
import { distanceM, useLocation } from '@/services/location';

export function useDropOpenedEvent(dropId: string, type: 'MUSIC' | 'VOTE' | 'PLAYLIST', detail: DropDetail | null | undefined, source: DropOpenSource | undefined) {
  const qc = useQueryClient();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!detail || sent.current === dropId) return;
    sent.current = dropId;
    const known = [['nearby'], ['myDrops']]
      .flatMap(key => qc.getQueriesData<DropSummary[]>({ queryKey: key }).flatMap(([, list]) => (Array.isArray(list) ? list : [])))
      .find(x => x.droppingId === dropId);
    const at = 'latitude' in detail ? detail : known;
    const here = useLocation.getState().coords;
    track('drop_opened', {
      drop_id: dropId,
      type,
      source: source ?? 'link',
      distance_m: at && here ? Math.round(distanceM(here, at)) : null,
    });
  }, [detail, dropId, type, source, qc]);
}
