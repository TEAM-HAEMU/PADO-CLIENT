/**
 * 드랍 상세 화면 고르기 — 상세 응답엔 type이 없어 모양으로 화면을 정한다.
 * 딥링크(pado://vote/<음악 드랍>)처럼 화면과 드랍 타입이 다르면 맞는 화면으로 바꾸고(replace),
 * 어느 모양도 아니면 '드랍을 찾을 수 없어요'를 보여 줄 수 있게 오류를 돌려준다 (예전엔 로딩만 계속 돌았다)
 */
import React from 'react';
import { ApiError } from '@/api/errors';
import { isMusicDetail, isPlaylistDetail, isVoteDetail, type DropDetail, type UUID } from '@/api/types';
import type { DropOpenSource } from './types';

export type DropScreen = 'PinPreview' | 'VoteDrop' | 'PlaylistDrop';

/** 응답 모양 → 그 드랍을 여는 화면. 어느 타입도 아니면 null */
export function dropScreenOf(d: DropDetail): DropScreen | null {
  if (isVoteDetail(d)) return 'VoteDrop';
  if (isPlaylistDetail(d)) return 'PlaylistDrop';
  if (isMusicDetail(d)) return 'PinPreview';
  return null;
}

/** 모양을 알 수 없는 응답 — 서버의 D2(드랍 없음)와 같은 문장으로 보여 준다 */
export const DROP_NOT_FOUND = new ApiError(404, { code: 'D2' });

type Replace = (name: DropScreen, params: { dropId: UUID; source?: DropOpenSource }) => void;

/**
 * 이 화면(here)이 받은 드랍을 그릴 수 있는지. 다른 타입이면 맞는 화면으로 replace한다.
 * 반환: error — 모양을 알 수 없을 때 ScreenState에 넘길 오류 (그 외엔 undefined)
 */
export function useDropScreen(here: DropScreen, navigation: { replace: Replace }, dropId: UUID, data: DropDetail | undefined, source?: DropOpenSource): { error: ApiError | undefined } {
  const target = data ? dropScreenOf(data) : undefined;
  React.useEffect(() => {
    if (target && target !== here) navigation.replace(target, { dropId, source });
  }, [target, here, navigation, dropId, source]);
  return { error: target === null ? DROP_NOT_FOUND : undefined };
}
