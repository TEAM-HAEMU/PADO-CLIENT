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
  gender?: boolean; // true=남성, false=여성 — 선택 항목
  agreements: Agreements;
}

/** 명세엔 naver도 있지만 앱은 카카오·Google·Apple(iOS)만 쓴다 */
export type SocialProvider = 'kakao' | 'google' | 'apple';

/** /oauth2/{provider} 요청 본문 — 카카오·Google은 제공자 액세스 토큰, Apple은 identity token + authorization code */
export type SocialLoginBody =
  | { accessToken: string }
  | { identityToken: string; authorizationCode: string; name?: string };

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
  gender?: boolean;
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
  /** Apple Music 곡 링크 (백엔드가 ISRC로 찾음) */
  appleMusic?: string | null;
}

export interface Song {
  id: UUID;
  title: string;
  artist: string;
  duration: number; // seconds
  albumImagePath: string | null;
  /** 국제 표준 녹음 코드 — 모르면 null */
  isrc?: string | null;
  /** 30초 미리듣기 (Apple Music, ISRC로 정확히 맞춘 곡). 없으면 null */
  previewUrl?: string | null;
  /** 19세 이상 곡 (Spotify explicit) — 백엔드가 내려 주면 미리듣기를 시도하지 않는다 */
  explicit?: boolean | null;
  links: SongLinks;
}

// ── 드랍 보기 설정 (운영자가 관리, GET /settings/drop-radius?latitude&longitude)
/** DISTANCE: 표시 반경 안 (displayMeters가 null이면 전국) / REGION: 내가 있는 행정구역 안 */
export type VisibilityMode = 'DISTANCE' | 'REGION';
export type RegionUnit = 'SIDO' | 'SIGUNGU' | 'DONG';

/** 같은 지역 모드에서 보낸 좌표가 속한 지역 — name은 주소 형식 ("부산광역시 해운대구") */
export interface DropRegion { unit: RegionUnit; code: string; name: string }

export interface DropRadius {
  mode: VisibilityMode;
  /** REGION일 때만 */
  regionUnit: RegionUnit | null;
  /** 지도에 드랍이 보이는 범위(m) — DISTANCE에서 null이면 전국, REGION에서는 null */
  displayMeters: number | null;
  /** 이 안에 들어와야 드랍을 열고 들을 수 있음(m) — 앱에서만 적용, 두 모드 모두 */
  playMeters: number;
  /** REGION이고 좌표를 보냈을 때 그 좌표의 지역. 못 찾았으면(바다 등) null */
  region: DropRegion | null;
  updatedAt: string | null;
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
  previewUrl?: string | null;
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
  previewUrl?: string | null;
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
  previewUrl?: string | null;
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
  /** 작성자 ID — 백엔드가 주면 댓글 메뉴에 '차단하기'가 보임 (현재 CommentResponse엔 없음) */
  userId?: UUID;
  /** 작성 시각 — 백엔드가 주면 댓글 옆에 'n분 전'으로 표시 (현재 CommentResponse엔 없음) */
  createdAt?: string;
}

// ── 알림
export type NotificationEvent = 'like-created' | 'comment-created' | 'dropping-created';

export interface AppNotification {
  id: UUID;
  eventName: NotificationEvent | string;
  /** 이벤트마다 다름. like-created: likerUserId, likerUsername, droppingOwnerUserId, droppingId · dropping-created(실서버): userId, songId 뿐 (droppingId·이름 없음) */
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
