import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AgreementType, ReportTarget, SocialProfile, SocialProvider, Song, UserAgreement, UUID } from '@/api/types';

export type TabParamList = {
  Map: undefined;
  Playlists: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  // 인증
  Login: undefined;
  EmailLogin: { email?: string } | undefined;
  Signup: { mode: 'email' } | { mode: 'social'; provider: SocialProvider; signupToken: string; profile: SocialProfile | null };
  LocationPermission: undefined;
  // 메인
  Tabs: NavigatorScreenParams<TabParamList>;
  PinPreview: { dropId: UUID };
  /** queue: 전체 재생/셔플 — 미리듣기가 끝나면 다음 곡으로. autoplay: 열자마자 미리듣기 */
  Player: { songId: UUID; dropId?: UUID; queue?: UUID[]; autoplay?: boolean };
  Comments: { dropId: UUID };
  /** song이 없으면 설정 화면의 '기본 재생 앱' 선택 모드 */
  ServicePicker: { song?: Pick<Song, 'id' | 'title' | 'artist' | 'links'> };
  // 드랍 만들기
  DropType: undefined;
  SongSearch: undefined;
  Note: undefined;
  VoteCreate: undefined;
  PlaylistDropCreate: undefined;
  DropSuccess: { art: string | null; content: string };
  // 상세
  VoteDrop: { dropId: UUID };
  PlaylistDrop: { dropId: UUID };
  /** openAdd: 방금 만든 플리 — 열리자마자 곡 담기 화면으로 */
  PlaylistDetail: { playlistId: UUID; openAdd?: boolean };
  AddSongs: { playlistId: UUID; existing: UUID[] } | { picker: 'vote' | 'newPlaylist'; existing: UUID[] };
  TrackMenu: { playlistId: UUID; song: Song };
  PlaylistPicker: { song: Song; excludeId?: UUID };
  NewPlaylist: { rename?: { id: UUID; name: string } } | undefined;
  // 내 공간
  ProfileEdit: undefined;
  Settings: undefined;
  BlockedUsers: undefined;
  ConfirmWithdraw: undefined;
  Report: { targetType: ReportTarget; targetId: UUID; userId?: UUID; label?: string };
  TermsUpdate: { changed: UserAgreement[] };
  TermsView: { type: AgreementType };
};

export type RootScreen<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
