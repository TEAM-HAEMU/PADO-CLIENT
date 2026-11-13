/**
 * 30초 미리듣기 — iTunes previewUrl을 앱 안에서 재생 (전체 곡은 '전체 듣기'로 고른 음악 앱에 딥링크, services/listen.ts).
 * 앱 전체에 오디오 플레이어 하나만 두고(PreviewHost), 화면은 usePreview 훅으로 제어한다.
 * 앱을 내려도 계속 재생 + 잠금화면/알림 컨트롤 (iOS UIBackgroundModes audio, Android 미디어 재생 서비스).
 * 처음 듣는 곡은 미리듣기 주소 조회(iTunes)와 첫 버퍼링에 몇 초 걸린다 → 누르는 즉시 pending/buffering으로 미니 디스크에 '불러오는 중'을 보여 준다.
 */
import React, { useEffect, useState } from 'react';
import { Platform, Settings } from 'react-native';
import Video from 'react-native-video';
import { create } from 'zustand';
import { toast } from '@/store/toast';
import { findPreview, noPreviewMessage, type PreviewSource } from './previewSource';
import { track } from '@/services/analytics';

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
  /** 누른 곡의 미리듣기 주소를 찾는 중 (아직 재생 전) — 미니 디스크가 곧바로 그 곡으로 '불러오는 중'을 보여 준다 */
  pending: { key: string; meta: PreviewMeta } | null;
  /** 재생을 시작했지만 아직 소리가 나기 전 (첫 버퍼링) */
  buffering: boolean;
  /**
   * 지금 곡이 끝나면 곧바로 이어 틀 곡 (주변 곡 자동 재생이 미리 채운다).
   * 곡이 끝날 때 플레이어를 내리지 않고 주소만 바꿔 끼운다 — 백그라운드에서 소리가 한 번 끊기면 iOS가 앱을 재워 다음 곡을 못 틀기 때문
   */
  upNext: { key: string; url: string; meta: PreviewMeta } | null;
  setUpNext: (next: PreviewState['upNext']) => void;
  play: (key: string, url: string, meta?: PreviewMeta) => void;
  toggle: () => void;
  stop: () => void;
  _progress: (pos: number, dur: number) => void;
  _ended: () => void;
  _ready: () => void;
}

/**
 * 재생 요청 토큰 — iTunes 조회를 기다리는 사이 화면을 떠나거나 다른 곡을 누르면 늦게 끝난 요청은 버린다.
 * begin()이 새 토큰을 주고, stop()/stopPreviewFor()/다른 곡 play()가 이전 토큰을 무효로 만든다.
 */
let intent = 0;
let intentKey: string | null = null;
const begin = (key: string, meta?: PreviewMeta) => {
  intentKey = key;
  usePreviewStore.setState({ pending: meta ? { key, meta } : null });
  return ++intent;
};
const current = (token: number) => token === intent;
const cancelIntent = (key?: string | null) => {
  if (!key || intentKey === key) { intent++; intentKey = null; usePreviewStore.setState({ pending: null }); }
};
/** 주소를 못 찾았을 때(미리듣기 없음·확인 불가) '불러오는 중' 표시를 거둔다 */
const settle = (token: number) => { if (current(token)) usePreviewStore.setState({ pending: null }); };

const IDLE = { key: null, url: null, meta: null, paused: true, position: 0, buffering: false };

export const usePreviewStore = create<PreviewState>((set, get) => ({
  ...IDLE,
  endedKey: null,
  duration: 30,
  pending: null,
  buffering: false,
  upNext: null,
  setUpNext: upNext => set({ upNext }),
  play: (key, url, meta) => {
    if (intentKey !== key) cancelIntent(); // 다른 곡의 대기 중인 재생 요청은 버린다
    if (get().key !== key) track('preview_started', { song_id: key, title: meta?.title, artist: meta?.artist });
    set(get().key === key ? { paused: false, endedKey: null, pending: null } : { key, url, meta: meta ?? null, paused: false, position: 0, duration: 30, endedKey: null, pending: null, buffering: true, upNext: null });
  },
  toggle: () => { const paused = !get().paused; track(paused ? 'preview_paused' : 'preview_resumed', { song_id: get().key, position: Math.round(get().position) }); set({ paused }); },
  stop: () => { cancelIntent(); set({ ...IDLE, endedKey: null, upNext: null }); },
  _progress: (position, duration) => set({ position, duration: duration || 30 }),
  _ended: () => {
    const { key, upNext } = get();
    track('preview_completed', { song_id: key });
    // 이어 틀 곡이 있으면 플레이어를 내리지 않고 바로 다음 곡으로 (endedKey로 끝난 곡을 알린다)
    if (upNext && upNext.key !== key) {
      track('preview_started', { song_id: upNext.key, title: upNext.meta.title, artist: upNext.meta.artist });
      set({ key: upNext.key, url: upNext.url, meta: upNext.meta, paused: false, position: 0, duration: 30, endedKey: key, pending: null, buffering: true, upNext: null });
      return;
    }
    set({ ...IDLE, endedKey: key, upNext: null });
  },
  _ready: () => { if (get().buffering) set({ buffering: false }); },
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
  const ready = usePreviewStore(st => st._ready);
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
      // 30초짜리라 넉넉히 받아 둘 필요 없음 — 조금이라도 받으면 바로 소리를 낸다
      automaticallyWaitsToMinimizeStalling={false}
      onLoad={ready}
      onProgress={e => { if (e.currentTime > 0) ready(); _progress(e.currentTime, e.seekableDuration || e.playableDuration); }}
      onEnd={ended}
      // 주소는 있는데 재생이 안 되면(만료·지역 제한 등) 조용히 멈추지 말고 알린다
      onError={() => { stop(); toast('미리듣기를 재생하지 못했어요. 잠시 후 다시 시도해주세요.', 'error'); }}
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
type PreviewSong = PreviewSource & { id: string; albumImagePath?: string | null };
const metaOf = (s: PreviewSong): PreviewMeta => ({ title: s.title, artist: s.artist, image: s.albumImagePath });

export async function startPreview(song: PreviewSong): Promise<'ok' | 'none' | 'adult' | 'unavailable' | 'cancelled'> {
  const st = usePreviewStore.getState();
  if (st.key === song.id) { if (st.paused) st.toggle(); return 'ok'; }
  const token = begin(song.id, metaOf(song));
  const r = await findPreview(song, { priority: true });
  if (!current(token)) return 'cancelled';
  if (r.unavailable || !r.previewUrl) { settle(token); return r.unavailable ? 'unavailable' : r.adult ? 'adult' : 'none'; }
  usePreviewStore.getState().play(song.id, r.previewUrl, metaOf(song));
  return 'ok';
}

/**
 * 곡 하나의 미리듣기 상태/제어.
 * lazy: 목록 행처럼 곡이 많은 곳 — 화면에 뜰 때 iTunes를 묻지 않고, 재생을 누를 때 조회한다 (요청 한도 보호)
 */
export function usePreview(song: PreviewSong | null | undefined, opts: { lazy?: boolean } = {}) {
  // undefined=조회 중, null=없음, false=지금은 확인 불가(누르면 다시 조회), string=미리듣기 주소
  const [found, setFound] = useState<{ id: string; url: string | null | false; adult?: boolean } | null>(null);
  // 곡이 바뀐 직후 한 번은 이전 곡의 주소가 남아 있으므로, 주소가 이 곡 것일 때만 쓴다
  const url: string | null | undefined | false = song && found?.id === song.id ? found.url : undefined;
  const setUrl = (u: string | null | false, adult?: boolean) => { if (song) setFound({ id: song.id, url: u, adult }); };
  const [looking, setLooking] = useState(false);
  const id = song?.id;
  // 이 곡과 관련된 값만 구독 — 재생 중 진행률 갱신(250ms)이 다른 곡 행까지 다시 그리지 않게
  const active = usePreviewStore(st => !!id && st.key === id);
  const paused = usePreviewStore(st => st.paused);
  useEffect(() => {
    let alive = true;
    if (!song || opts.lazy) return;
    const id = song.id;
    findPreview(song, { priority: true }).then(r => { if (alive) setFound({ id, url: r.unavailable ? false : r.previewUrl, adult: r.adult }); });
    return () => { alive = false; };
  }, [song?.id, song?.title, song?.artist, song?.previewUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    loading: looking || (!opts.lazy && url === undefined),
    /** lazy면 눌러보기 전까지, 확인 불가(false)면 다시 누를 수 있게 '가능'으로 보여준다 */
    available: opts.lazy ? url !== null : url === false || !!url,
    playing: active && !paused,
    toggle: async () => {
      if (!song) return;
      const st = usePreviewStore.getState();
      if (st.key === song.id) return st.toggle();
      // 미리듣기가 없는 곡 — 버튼을 막아 두면 눌러도 반응이 없어 고장 난 것처럼 보이므로 이유를 알린다
      if (url === null) return toast(noPreviewMessage({ adult: found?.adult }));
      const token = begin(song.id, metaOf(song));
      let u = url;
      if (!u) {
        setLooking(true);
        const r = await findPreview(song, { priority: true }).finally(() => setLooking(false));
        if (!current(token)) return; // 기다리는 사이 화면을 떠났거나 다른 곡을 누름
        if (r.unavailable) { settle(token); return toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error'); }
        setUrl(r.previewUrl, r.adult);
        if (!r.previewUrl) { settle(token); return toast(noPreviewMessage(r)); }
        u = r.previewUrl;
      }
      usePreviewStore.getState().play(song.id, u, metaOf(song));
    },
    stop: () => stopPreviewFor(id),
  };
}
