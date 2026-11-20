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
/** 재생(드랍 열기·듣기) 기준 — DISTANCE: 재생 반경 안 / REGION: 재생 반경 안 또는 내가 있는 지역 안 */
export type PlayMode = 'DISTANCE' | 'REGION';
export type RegionUnit = 'SIDO' | 'SIGUNGU' | 'DONG';

/** 같은 지역 모드에서 보낸 좌표가 속한 지역 — name은 주소 형식 ("부산광역시 해운대구") */
export interface DropRegion { unit: RegionUnit; code: string; name: string }

/** 드랍이 놓인 지역 코드 (시·도 2자리, 시·군·구 5자리, 행정동 10자리). 모르는 단위는 null */
export interface RegionCodes { sido: string | null; sigungu: string | null; dong: string | null }

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
  /** 재생 기준 (보기 모드와 따로) — REGION이면 같은 지역 드랍도 열림. 새 필드가 없는 예전 서버는 DISTANCE */
  playMode: PlayMode;
  /** playMode REGION일 때만 */
  playRegionUnit: RegionUnit | null;
  /** playMode REGION이고 좌표를 보냈을 때 그 좌표의 지역(playRegionUnit 단위). 없으면 거리로만 판정 */
  playRegion: DropRegion | null;
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
  /** 서버가 찾은 드랍 자리의 장소 이름(카카오 — 가게·건물 등). 새 필드라 예전 서버·못 찾은 드랍은 없거나 null → 주소를 보여 준다 */
  placeName?: string | null;
  isMyDropping: boolean;
  /** 만든 시각 (ISO) — 요약 응답에 있을 때만. 없으면 목록 순서를 그대로 쓴다 (utils/dropOrder.ts) */
  createdAt?: string | null;
  /** 같은 지역 재생 판정용 — 새 필드라 예전 서버·백필 안 된 드랍은 없거나 null (그러면 거리로만 판정) */
  regionCodes?: RegionCodes | null;
  /** 받은 좋아요 수 — 내 드랍 목록(GET /users/my-drop)에만 온다. 새 필드라 예전 서버는 없다 → 프로필이 드랍마다 따로 묻는다(상한 있음) */
  likeCount?: number | null;
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
  /** 작성자 프로필 사진 — 없거나 탈퇴 처리된 작성자면 null. 비었거나 못 불러오면 이니셜로 보인다 */
  profileImageUrl?: string | null;
  content: string;
  /** 만료 시각. 무제한 드랍은 먼 미래(9999-12-31) — expiryLabel이 문구를 숨긴다 */
  expiryDate: string;
  createdAt: string;
  albumImageUrl: string | null;
  previewUrl?: string | null;
  /** 서버가 찾은 드랍 자리의 장소 이름(카카오 — 가게·건물 등). 새 필드라 예전 서버·못 찾은 드랍은 없거나 null → 주소를 보여 준다 */
  placeName?: string | null;
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
  /** 작성자 이름 (서버 응답엔 있음 — 화면엔 아직 안 씀) */
  username?: string;
  /** 작성자 프로필 사진 — 없거나 탈퇴 처리된 작성자면 null. 비었거나 못 불러오면 이니셜로 보인다 */
  profileImageUrl?: string | null;
  topic: string;
  options: VoteOption[];
  content: string;
  latitude: number;
  longitude: number;
  address: string;
  /** 서버가 찾은 드랍 자리의 장소 이름(카카오 — 가게·건물 등). 새 필드라 예전 서버·못 찾은 드랍은 없거나 null → 주소를 보여 준다 */
  placeName?: string | null;
  /** 만료 시각. 무제한 드랍은 먼 미래(9999-12-31) — expiryLabel이 문구를 숨긴다 */
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
  /** 작성자 이름 (서버 응답엔 있음 — 화면엔 아직 안 씀) */
  username?: string;
  /** 작성자 프로필 사진 — 없거나 탈퇴 처리된 작성자면 null. 비었거나 못 불러오면 이니셜로 보인다 */
  profileImageUrl?: string | null;
  playlistName: string;
  songs: PlaylistDropSong[];
  content: string;
  latitude: number;
  longitude: number;
  address: string;
  /** 서버가 찾은 드랍 자리의 장소 이름(카카오 — 가게·건물 등). 새 필드라 예전 서버·못 찾은 드랍은 없거나 null → 주소를 보여 준다 */
  placeName?: string | null;
  /** 만료 시각. 무제한 드랍은 먼 미래(9999-12-31) — expiryLabel이 문구를 숨긴다 */
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
  /** 음악 드랍의 곡 ID — 현재 백엔드 응답엔 없음. 들어오면 곡 추가 시트가 드랍 상세를 따로 받지 않는다 */
  songId?: UUID | null;
  title?: string;
  artist?: string;
  topic?: string;
  playlistName?: string;
  imageUrl: string | null;
  address: string;
  /** 서버가 찾은 드랍 자리의 장소 이름(카카오 — 가게·건물 등). 새 필드라 예전 서버·못 찾은 드랍은 없거나 null → 주소를 보여 준다 */
  placeName?: string | null;
}

// ── 댓글
export interface Comment {
  id: UUID;
  content: string;
  droppingId: UUID;
  username: string;
  /** 작성자 프로필 사진 — 백엔드가 주면 댓글 옆 동그라미에 보임(없거나 못 불러오면 이니셜) */
  profileImageUrl?: string | null;
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

// ── 푸시 알림 (FCM)
export type PushPlatform = 'IOS' | 'ANDROID';
/**
 * 설정 › 알림 — 서버가 보내기 전에 거른다. 행이 없으면 서버 기본값(like·comment·notice 켜짐, nearby·marketing 꺼짐).
 * marketing: 혜택·소식(광고성) 알림 수신 동의 — 선택, 기본 꺼짐 (handoff/push-marketing-contract.md)
 */
export interface PushSettings { like: boolean; comment: boolean; nearby: boolean; notice: boolean; marketing: boolean }
/** GET·PUT /push/settings 응답 — marketingUpdatedAt: 혜택·소식 알림에 마지막으로 동의·철회한 시각 (ISO, 없으면 null). 응답에만 */
export type PushSettingsResponse = PushSettings & { marketingUpdatedAt?: string | null };
/** 푸시 data (값은 모두 문자열 — FCM 규칙). 앱이 열 화면을 정하는 데 쓴다 */
export type PushType = 'comment' | 'like' | 'nearby' | 'notice';
/** 운영자 발송(notice) 종류 — NOTICE 운영 공지 · AD 혜택·소식(광고성) */
export type PushNoticeKind = 'NOTICE' | 'AD';
/** 운영자 발송(notice)을 눌렀을 때 열 곳. DROP_OR_INBOX는 옛 기록·옛 앱 호환 (드랍이 있으면 드랍, 없으면 알림 화면) */
export type PushNoticeTarget = 'DROP' | 'CREATE_DROP' | 'MAP' | 'MY_PLAYLISTS' | 'MY' | 'DROP_OR_INBOX';

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
