/**
 * 30초 미리듣기 — iTunes previewUrl을 앱 안에서 재생 (전체 곡은 '전체 듣기'로 고른 음악 앱에 딥링크, services/listen.ts).
 * 앱 전체에 오디오 플레이어 하나만 두고(PreviewHost), 화면은 usePreview 훅으로 제어한다.
 * 앱을 내려도 계속 재생 + 잠금화면/알림 컨트롤 (iOS UIBackgroundModes audio, Android 미디어 재생 서비스).
 */
import React, { useEffect, useState } from 'react';
import { Platform, Settings } from 'react-native';
import Video from 'react-native-video';
import { create } from 'zustand';
import { toast } from '@/store/toast';
import { findItunes } from './itunes';

/** 잠금화면·알림에 보일 곡 정보 */
export interface PreviewMeta { title: string; artist: string; image?: string | null }

interface PreviewState {
  key: string | null;
  meta: PreviewMeta | null;
  /** 끝까지 재생된 곡 id (다음 곡으로 넘길 때 사용) */
  endedKey: string | null;
  url: string | null;
  paused: boolean;
  position: number;
  duration: number;
  play: (key: string, url: string, meta?: PreviewMeta) => void;
  toggle: () => void;
  stop: () => void;
  _progress: (pos: number, dur: number) => void;
  _ended: () => void;
}

/**
 * 재생 요청 토큰 — iTunes 조회를 기다리는 사이 화면을 떠나거나 다른 곡을 누르면 늦게 끝난 요청은 버린다.
 * begin()이 새 토큰을 주고, stop()/stopPreviewFor()/다른 곡 play()가 이전 토큰을 무효로 만든다.
 */
let intent = 0;
let intentKey: string | null = null;
const begin = (key: string) => { intentKey = key; return ++intent; };
const current = (token: number) => token === intent;
const cancelIntent = (key?: string | null) => { if (!key || intentKey === key) { intent++; intentKey = null; } };

const IDLE = { key: null, url: null, meta: null, paused: true, position: 0 };

export const usePreviewStore = create<PreviewState>((set, get) => ({
  ...IDLE,
  endedKey: null,
  duration: 30,
  play: (key, url, meta) => {
    if (intentKey !== key) cancelIntent(); // 다른 곡의 대기 중인 재생 요청은 버린다
    set(get().key === key ? { paused: false, endedKey: null } : { key, url, meta: meta ?? null, paused: false, position: 0, duration: 30, endedKey: null });
  },
  toggle: () => set({ paused: !get().paused }),
  stop: () => { cancelIntent(); set({ ...IDLE, endedKey: null }); },
  _progress: (position, duration) => set({ position, duration: duration || 30 }),
  _ended: () => set({ ...IDLE, endedKey: get().key }),
}));

// UI 테스트는 `-PADO_MUTE YES` 실행 인자를 넘긴다 → 미리듣기를 무음으로 (화면 동작은 그대로)
const MUTED = Platform.OS === 'ios' && Settings.get('PADO_MUTE') === 'YES';

export function PreviewHost() {
  const url = usePreviewStore(st => st.url);
  const meta = usePreviewStore(st => st.meta);
  const paused = usePreviewStore(st => st.paused);
  const _progress = usePreviewStore(st => st._progress);
  const stop = usePreviewStore(st => st.stop);
  const ended = usePreviewStore(st => st._ended);
  if (!url) return null;
  return (
    <Video
      source={{ uri: url, metadata: meta ? { title: meta.title, artist: meta.artist, imageUri: meta.image ?? undefined } : undefined }}
      paused={paused}
      muted={MUTED}
      volume={MUTED ? 0 : 1}
      // 앱을 내려도 계속 + 잠금화면·알림 컨트롤
      playInBackground
      playWhenInactive
      showNotificationControls
      ignoreSilentSwitch="ignore"
      progressUpdateInterval={250}
      onProgress={e => _progress(e.currentTime, e.seekableDuration || e.playableDuration)}
      onEnd={ended}
      onError={stop}
      style={{ width: 0, height: 0 }}
    />
  );
}

/** 진행률 (250ms마다 바뀜) — 작은 하위 컴포넌트에서만 구독해 화면 전체가 다시 그려지지 않게 */
export function usePreviewProgress(songId: string | undefined | null) {
  const position = usePreviewStore(st => (!!songId && st.key === songId ? st.position : 0));
  const duration = usePreviewStore(st => (!!songId && st.key === songId ? st.duration : 30));
  return { position, duration };
}

/** 이 곡이 재생 중이면 정지 (화면을 떠날 때 cleanup에서 호출 — 항상 최신 상태를 읽는다) */
export function stopPreviewFor(songId: string | undefined | null) {
  if (!songId) return;
  const st = usePreviewStore.getState();
  if (st.key === songId) st.stop();
  else cancelIntent(songId); // 아직 시작 전(iTunes 조회 중)이면 시작하지 않게
}

/**
 * 화면 밖(목록 선택 등)에서 곧바로 미리듣기 시작 — 이미 이 곡이면 이어서 재생.
 * none: 미리듣기 없는 곡 / unavailable: 지금 iTunes 조회 불가 / cancelled: 기다리는 사이 다른 곡·화면 이탈
 */
type PreviewSong = { id: string; title: string; artist: string; albumImagePath?: string | null };
const metaOf = (s: PreviewSong): PreviewMeta => ({ title: s.title, artist: s.artist, image: s.albumImagePath });

export async function startPreview(song: PreviewSong): Promise<'ok' | 'none' | 'unavailable' | 'cancelled'> {
  const st = usePreviewStore.getState();
  if (st.key === song.id) { if (st.paused) st.toggle(); return 'ok'; }
  const token = begin(song.id);
  const r = await findItunes(song.title, song.artist);
  if (!current(token)) return 'cancelled';
  if (r.unavailable) return 'unavailable';
  if (!r.previewUrl) return 'none';
  usePreviewStore.getState().play(song.id, r.previewUrl, metaOf(song));
  return 'ok';
}

/**
 * 곡 하나의 미리듣기 상태/제어.
 * lazy: 목록 행처럼 곡이 많은 곳 — 화면에 뜰 때 iTunes를 묻지 않고, 재생을 누를 때 조회한다 (요청 한도 보호)
 */
export function usePreview(song: PreviewSong | null | undefined, opts: { lazy?: boolean } = {}) {
  // undefined=조회 중, null=없음, false=지금은 확인 불가(누르면 다시 조회), string=미리듣기 주소
  const [found, setFound] = useState<{ id: string; url: string | null | false } | null>(null);
  // 곡이 바뀐 직후 한 번은 이전 곡의 주소가 남아 있으므로, 주소가 이 곡 것일 때만 쓴다
  const url: string | null | undefined | false = song && found?.id === song.id ? found.url : undefined;
  const setUrl = (u: string | null | false) => { if (song) setFound({ id: song.id, url: u }); };
  const [looking, setLooking] = useState(false);
  const id = song?.id;
  // 이 곡과 관련된 값만 구독 — 재생 중 진행률 갱신(250ms)이 다른 곡 행까지 다시 그리지 않게
  const active = usePreviewStore(st => !!id && st.key === id);
  const paused = usePreviewStore(st => st.paused);
  useEffect(() => {
    let alive = true;
    if (!song || opts.lazy) return;
    const id = song.id;
    findItunes(song.title, song.artist).then(r => { if (alive) setFound({ id, url: r.unavailable ? false : r.previewUrl }); });
    return () => { alive = false; };
  }, [song?.id, song?.title, song?.artist]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    loading: looking || (!opts.lazy && url === undefined),
    /** lazy면 눌러보기 전까지, 확인 불가(false)면 다시 누를 수 있게 '가능'으로 보여준다 */
    available: opts.lazy ? url !== null : url === false || !!url,
    playing: active && !paused,
    toggle: async () => {
      if (!song) return;
      const st = usePreviewStore.getState();
      if (st.key === song.id) return st.toggle();
      const token = begin(song.id);
      let u = url;
      if (!u) {
        setLooking(true);
        const r = await findItunes(song.title, song.artist).finally(() => setLooking(false));
        if (!current(token)) return; // 기다리는 사이 화면을 떠났거나 다른 곡을 누름
        if (r.unavailable) return toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error');
        setUrl(r.previewUrl);
        if (!r.previewUrl) return toast('이 곡은 미리듣기를 지원하지 않아요.');
        u = r.previewUrl;
      }
      usePreviewStore.getState().play(song.id, u, metaOf(song));
    },
    stop: () => stopPreviewFor(id),
  };
}
