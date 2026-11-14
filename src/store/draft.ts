/** 드랍 작성 중 상태 (유형 선택 → 곡/후보 → 한마디 → 생성) */
import { create } from 'zustand';
import type { DropType, Song, UUID } from '@/api/types';

export type PlaylistChoice = { kind: 'existing'; playlistId: UUID; name: string; art: string | null } | { kind: 'new'; name: string; songs: Song[] };

interface Draft {
  /** 초안 번호 — 새로 시작하거나 비울 때마다 바뀐다 (제출이 끝났을 때 아직 같은 초안인지 확인) */
  id: number;
  type: DropType;
  song: Song | null;
  topic: string;
  options: Song[];
  playlist: PlaylistChoice | null;
  content: string;
  /** 곡 추가 시트가 투표/새 플리 후보를 고를 때 결과를 여기로 */
  picked: Song[];
  start: (type: DropType) => void;
  set: (p: Partial<Omit<Draft, 'id' | 'start' | 'set' | 'reset'>>) => void;
  reset: () => void;
}

const empty = { type: 'MUSIC' as DropType, song: null, topic: '', options: [], playlist: null, content: '', picked: [] };
let seq = 0;
export const useDraft = create<Draft>(set => ({
  ...empty,
  id: 0,
  start: type => set({ ...empty, type, id: ++seq }),
  set: p => set(p),
  reset: () => set({ ...empty, id: ++seq }),
}));

/** 대표 앨범 아트 */
export const draftArt = (d: Pick<Draft, 'type' | 'song' | 'options' | 'playlist'>): string | null =>
  d.type === 'MUSIC' ? d.song?.albumImagePath ?? null
    : d.type === 'VOTE' ? d.options[0]?.albumImagePath ?? null
    : d.playlist?.kind === 'existing' ? d.playlist.art : d.playlist?.songs[0]?.albumImagePath ?? null;
