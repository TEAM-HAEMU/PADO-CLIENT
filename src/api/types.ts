/**
 * PADO 백엔드 데이터 계약 — API 명세(/api/v1) 그대로.
 * 필드명·nullable 여부는 명세 예시 기준. 명세에 없는 값은 만들지 않는다.
 */

export type UUID = string;
export type DropType = 'MUSIC' | 'VOTE' | 'PLAYLIST';

// ── 인증
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export type AgreementType = 'SERVICE' | 'PRIVACY' | 'LOCATION' | 'MARKETING';
export type Agreements = Record<AgreementType, boolean>;

export interface RegisterBody {
  username: string;
  password: string;
  email: string;
  birthDate: string; // yyyy-MM-dd
  gender: boolean; // true=남성, false=여성
  agreements: Agreements;
}

/** 명세엔 naver도 있지만 앱은 카카오·Google만 쓴다 */
export type SocialProvider = 'kakao' | 'google';

export interface SocialProfile {
  username: string | null;
  email: string | null;
  profileImageUrl: string | null;
  birthDate: string | null;
  gender: boolean | null;
}

export interface SocialLoginResponse {
  signupRequired: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresIn: number | null;
  refreshTokenExpiresIn: number | null;
  signupToken: string | null;
  profile: SocialProfile | null;
}

export interface SocialSignupBody {
  signupToken: string;
  username: string;
  email?: string;
  birthDate: string;
  gender: boolean;
  agreements: Agreements;
}

export interface Term {
  type: AgreementType;
  title: string;
  version: string;
  required: boolean;
}

export interface UserAgreement {
  type: AgreementType;
  agreedVersion: string;
  latestVersion: string;
  agreed: boolean;
  decidedAt: string;
}

// ── 회원
export interface MyProfile {
  username: string;
  profileImageUrl: string | null;
  gender: boolean | null;
  birth: string | null;
  /** ⏳ 어드민 배포 후 추가 예정 */
  sanctionType?: 'RESTRICT' | null;
  sanctionEndsAt?: string | null;
}

export interface UpdateProfileBody {
  username?: string;
  gender?: boolean;
  birthDate?: string;
}

// ── 음악
export interface SongLinks {
  spotify: string | null;
  youtubeMusic: string | null;
}

export interface Song {
  id: UUID;
  title: string;
  artist: string;
  duration: number; // seconds
  albumImagePath: string | null;
  links: SongLinks;
}

// ── 드랍 (주변 검색 / 내 드랍 목록 아이템)
interface DropSummaryBase {
  droppingId: UUID;
  userId: UUID;
  content: string;
  latitude: number;
  longitude: number;
  address: string;
  isMyDropping: boolean;
}

export interface MusicDropSummary extends DropSummaryBase {
  type: 'MUSIC';
  songId: UUID;
  title: string;
  artist: string;
  albumImageUrl: string | null;
}

export interface VoteDropSummary extends DropSummaryBase {
  type: 'VOTE';
  topic: string;
  options: UUID[];
  firstAlbumImageUrl: string | null;
}

export interface PlaylistDropSummary extends DropSummaryBase {
  type: 'PLAYLIST';
  playlistName: string;
  songIds: UUID[];
  firstAlbumImageUrl: string | null;
}

export type DropSummary = MusicDropSummary | VoteDropSummary | PlaylistDropSummary;

// ── 드랍 상세 (타입마다 응답 모양이 다름 — 명세에 type 필드가 없어 필드로 판별)
export interface MusicDropDetail {
  droppingId: UUID;
  songId: UUID;
  userId: UUID;
  username: string;
  content: string;
  expiryDate: string;
  createdAt: string;
  albumImageUrl: string | null;
}

export interface VoteOption {
  songId: UUID;
  albumImagePath: string | null;
  title: string;
  artist: string;
  voteCount: number;
}

export interface VoteDropDetail {
  droppingId: UUID;
  userId: UUID;
  topic: string;
  options: VoteOption[];
  content: string;
  latitude: number;
  longitude: number;
  address: string;
  expiryDate: string;
  createdAt: string;
  totalVotes: number;
  userVotedOption: UUID | null;
}

export interface PlaylistDropSong {
  songId: UUID;
  title: string;
  artist: string;
  albumImagePath: string | null;
}

export interface PlaylistDropDetail {
  droppingId: UUID;
  userId: UUID;
  playlistName: string;
  songs: PlaylistDropSong[];
  content: string;
  latitude: number;
  longitude: number;
  address: string;
  expiryDate: string;
  createdAt: string;
}

export type DropDetail = MusicDropDetail | VoteDropDetail | PlaylistDropDetail;

// 상세 응답엔 type 필드가 없어 필드로 구분 (서버가 빈 필드를 null로 줄 수도 있어 값 존재까지 확인)
export const isVoteDetail = (d: DropDetail): d is VoteDropDetail => (d as VoteDropDetail).topic != null && Array.isArray((d as VoteDropDetail).options);
export const isPlaylistDetail = (d: DropDetail): d is PlaylistDropDetail => (d as PlaylistDropDetail).playlistName != null;
export const isMusicDetail = (d: DropDetail): d is MusicDropDetail => (d as MusicDropDetail).songId != null && (d as VoteDropDetail).topic == null;

// ── 드랍 생성
interface CreateDropBase {
  content: string;
  latitude: number;
  longitude: number;
  address: string;
}
export type CreateDropBody =
  | (CreateDropBase & { type: 'MUSIC'; songId: UUID })
  | (CreateDropBase & { type: 'VOTE'; topic: string; options: UUID[] })
  | (CreateDropBase & { type: 'PLAYLIST'; playlistId: UUID })
  | (CreateDropBase & { type: 'PLAYLIST'; playlistName: string; songIds: UUID[] });

// ── 좋아요 보관함
export interface LikedDrop {
  droppingId: UUID;
  droppingType: DropType;
  title?: string;
  artist?: string;
  topic?: string;
  playlistName?: string;
  imageUrl: string | null;
  address: string;
}

// ── 댓글
export interface Comment {
  id: UUID;
  content: string;
  droppingId: UUID;
  username: string;
}

// ── 알림
export type NotificationEvent = 'like-created' | 'comment-created' | 'dropping-created';

export interface AppNotification {
  id: UUID;
  eventName: NotificationEvent | string;
  /** 이벤트마다 다름. like-created: likerUserId, likerUsername, droppingOwnerUserId, droppingId */
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

// ── 플레이리스트
export interface PlaylistSummary {
  id: UUID;
  name: string;
  albumImageUrl: string | null;
}

export interface PlaylistDetail {
  id: UUID;
  name: string;
  songs: Song[];
}

// ── 신고·차단
export type ReportTarget = 'DROPPING' | 'COMMENT' | 'USER';
export type ReportReason = 'SPAM' | 'ABUSE' | 'SEXUAL' | 'HATE' | 'PRIVACY' | 'ETC';

export interface BlockedUser {
  userId: UUID;
  username: string;
  profileImageUrl: string | null;
  blockedAt: string;
}

// ── 오류
export interface ApiErrorBody {
  message: string;
  code: string;
}
