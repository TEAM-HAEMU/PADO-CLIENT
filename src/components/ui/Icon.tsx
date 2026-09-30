/**
 * PADO 아이콘 — Figma 공통 에셋 "Icon/*" 세트와 같은 패스 (24×24, stroke 1.8).
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme/tokens';

export type IconName =
  | 'search' | 'bell' | 'user' | 'map' | 'library' | 'plus' | 'play' | 'pause' | 'heart' | 'heartFill' | 'comment'
  | 'external' | 'check' | 'chevronLeft' | 'chevronRight' | 'chevronDown' | 'pin' | 'more' | 'shuffle' | 'close'
  | 'locate' | 'layers' | 'vote' | 'playlist' | 'music' | 'export' | 'wave' | 'link' | 'edit' | 'share' | 'alert'
  | 'swap' | 'mail' | 'settings' | 'trash' | 'flag' | 'block' | 'send' | 'eye' | 'eyeOff' | 'camera' | 'prev' | 'next';

interface Props { name: IconName; size?: number; color?: string; strokeWidth?: number }

const FILLED: IconName[] = ['play', 'pause', 'more', 'heartFill'];

export function Icon({ name, size = 24, color = colors.ink, strokeWidth = 1.8 }: Props) {
  const filled = FILLED.includes(name);
  const p = filled
    ? { fill: color, stroke: 'none' }
    : { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {PATHS[name](p)}
    </Svg>
  );
}

type P = Record<string, unknown>;
const PATHS: Record<IconName, (p: P) => React.ReactNode> = {
  search: p => <><Circle cx="11" cy="11" r="7" {...p} /><Path d="M20 20l-3.6-3.6" {...p} /></>,
  bell: p => <><Path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9z" {...p} /><Path d="M10.2 20.5a2 2 0 0 0 3.6 0" {...p} /></>,
  user: p => <><Circle cx="12" cy="8" r="4" {...p} /><Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...p} /></>,
  map: p => <><Path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z" {...p} /><Path d="M9 4.5v13M15 6.5v13" {...p} /></>,
  library: p => <Path d="M5 4.5v15M10 4.5v15M14.5 5.5l4 14" {...p} />,
  plus: p => <Path d="M12 5v14M5 12h14" {...p} />,
  prev: p => <Path d="M6 5v14M19 5.8v12.4a.7.7 0 0 1-1.1.6L9.4 12.6a.7.7 0 0 1 0-1.2l8.5-6.2a.7.7 0 0 1 1.1.6z" {...p} />,
  next: p => <Path d="M18 5v14M5 5.8v12.4a.7.7 0 0 0 1.1.6l8.5-6.2a.7.7 0 0 0 0-1.2L6.1 5.2A.7.7 0 0 0 5 5.8z" {...p} />,
  play: p => <Path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" {...p} />,
  pause: p => <><Rect x="6" y="4.5" width="4" height="15" rx="1.2" {...p} /><Rect x="14" y="4.5" width="4" height="15" rx="1.2" {...p} /></>,
  heart: p => <Path d="M12 20.5S3 15 3 9.2C3 6.3 5.2 4.5 7.6 4.5c1.9 0 3.4 1.1 4.4 2.7 1-1.6 2.5-2.7 4.4-2.7 2.4 0 4.6 1.8 4.6 4.7 0 5.8-9 11.3-9 11.3z" {...p} />,
  heartFill: p => <Path d="M12 20.5S3 15 3 9.2C3 6.3 5.2 4.5 7.6 4.5c1.9 0 3.4 1.1 4.4 2.7 1-1.6 2.5-2.7 4.4-2.7 2.4 0 4.6 1.8 4.6 4.7 0 5.8-9 11.3-9 11.3z" {...p} />,
  comment: p => <Path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z" {...p} />,
  external: p => <Path d="M7 17 17 7M8.5 7H17v8.5" {...p} />,
  check: p => <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} />,
  chevronLeft: p => <Path d="m15 5-7 7 7 7" {...p} />,
  chevronRight: p => <Path d="m9 5 7 7-7 7" {...p} />,
  chevronDown: p => <Path d="m5 9 7 7 7-7" {...p} />,
  pin: p => <><Path d="M12 21s-7-6.1-7-11.4a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" {...p} /><Circle cx="12" cy="9.5" r="2.4" {...p} /></>,
  more: p => <><Circle cx="5.5" cy="12" r="1.6" {...p} /><Circle cx="12" cy="12" r="1.6" {...p} /><Circle cx="18.5" cy="12" r="1.6" {...p} /></>,
  shuffle: p => <Path d="M3 7h3.5c2.5 0 4 1.6 5.5 5s3 5 5.5 5H21M3 17h3.5c1.3 0 2.3-.4 3.2-1.2M14.3 8.2c.9-.8 1.9-1.2 3.2-1.2H21M18 4l3 3-3 3M18 14l3 3-3 3" {...p} />,
  close: p => <Path d="M6 6l12 12M18 6 6 18" {...p} />,
  locate: p => <><Circle cx="12" cy="12" r="7" {...p} /><Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" {...p} /><Circle cx="12" cy="12" r="1.8" {...p} /></>,
  layers: p => <><Path d="m12 3.5 8.5 4.8L12 13 3.5 8.3z" {...p} /><Path d="m3.5 12.5 8.5 4.8 8.5-4.8" {...p} /></>,
  vote: p => <Path d="M5.5 20V11M12 20V4.5M18.5 20v-7" {...p} />,
  playlist: p => <><Path d="M3.5 6.5h12M3.5 12h12M3.5 17.5h7" {...p} /><Path d="M17.5 17.5V9.5l3-.8" {...p} /><Circle cx="15.8" cy="17.5" r="1.8" {...p} /></>,
  music: p => <><Path d="M9 18V5.5l11-2V16" {...p} /><Circle cx="6.5" cy="18" r="2.5" {...p} /><Circle cx="17.5" cy="16" r="2.5" {...p} /></>,
  export: p => <><Path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" {...p} /><Path d="M4.5 13.5v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" {...p} /></>,
  wave: p => <Path d="M3 12h1.5M7 8.5v7M11 5v14M15 9v6M19 10.5v3" {...p} />,
  link: p => <><Path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" {...p} /><Path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" {...p} /></>,
  edit: p => <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" {...p} />,
  share: p => <><Path d="M12 3.5v11M7.5 8 12 3.5 16.5 8" {...p} /><Path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" {...p} /></>,
  alert: p => <><Circle cx="12" cy="12" r="8.5" {...p} /><Path d="M12 7.5v5.2M12 16.3v.2" {...p} /></>,
  swap: p => <Path d="M7 4 3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7" {...p} />,
  mail: p => <><Rect x="3" y="5" width="18" height="14" rx="2.5" {...p} /><Path d="m3.5 6.5 8.5 6 8.5-6" {...p} /></>,
  settings: p => <><Circle cx="12" cy="12" r="3" {...p} /><Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" {...p} /></>,
  trash: p => <><Path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-13" {...p} /></>,
  flag: p => <><Path d="M5 21V4.5" {...p} /><Path d="M5 4.5h11l-2 4 2 4H5" {...p} /></>,
  block: p => <><Circle cx="12" cy="12" r="8.5" {...p} /><Path d="M6 6l12 12" {...p} /></>,
  send: p => <Path d="M4 12 20 4l-6 16-2.5-6.5z" {...p} />,
  eye: p => <><Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...p} /><Circle cx="12" cy="12" r="3" {...p} /></>,
  eyeOff: p => <><Path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.3 7.3A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.2-1" {...p} /></>,
  camera: p => <><Path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" {...p} /><Circle cx="12" cy="13" r="3.5" {...p} /></>,
};
