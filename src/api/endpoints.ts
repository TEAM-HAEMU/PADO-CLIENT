/**
 * API 명세 1:1 함수. 경로·메서드·인증 요구사항은 명세 그대로 (운영자용 /admin 제외).
 */
import { api } from './client';
import type {
  AppNotification, BlockedUser, Comment, CreateDropBody, DropDetail, DropSummary, LikedDrop, MyProfile,
  PlaylistDetail, PlaylistSummary, RegisterBody, ReportReason, ReportTarget, SocialLoginResponse, SocialProvider,
  SocialSignupBody, Song, Term, TokenPair, UpdateProfileBody, UserAgreement, UUID,
} from './types';

/** 경로 조각 인코딩 — 딥링크 등 외부에서 온 ID로 다른 경로를 호출하지 못하게 */
const e = encodeURIComponent;

// ── 인증
export const authApi = {
  register: (body: RegisterBody) => api.post('/auth/register', body, { auth: 'none' }),
  login: (email: string, password: string) => api.post<TokenPair>('/auth/login', { email, password }, { auth: 'none' }),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }, { auth: 'none' }),
  social: (provider: SocialProvider, accessToken: string) =>
    api.post<SocialLoginResponse>(`/oauth2/${provider}`, { accessToken }, { auth: 'none' }),
  socialSignup: (body: SocialSignupBody) => api.post<TokenPair>('/oauth2/signup', body, { auth: 'none' }),
  terms: () => api.get<Term[]>('/terms', { auth: 'none' }),
};

// ── 회원
export const userApi = {
  me: () => api.get<MyProfile>('/users'),
  update: (body: UpdateProfileBody) => api.patch('/users', body),
  uploadProfileImage: (uri: string, mime = 'image/jpeg', name = 'profile.jpg') => {
    const form = new FormData();
    form.append('image', { uri, type: mime, name } as unknown as Blob);
    return api.put<{ profileImageUrl: string }>('/users/profile-image', undefined, { form } as never);
  },
  withdraw: () => api.post('/users/withdrawal'),
  myDrops: () => api.get<{ droppings: DropSummary[] }>('/users/my-drop').then(r => r.droppings),
  myLikes: () => api.get<{ droppings: LikedDrop[] }>('/users/my-like').then(r => r.droppings),
  agreements: () => api.get<UserAgreement[]>('/users/agreements'),
  setMarketing: (agreed: boolean) => api.put('/users/agreements/marketing', { agreed }),
};

// ── 음악
export const songApi = {
  search: (query: string, limit = 20) => api.get<{ songs: Song[] }>('/songs/search', { query: { query, limit }, auth: 'none' }).then(r => r.songs),
  get: (id: UUID) => api.get<Song>(`/songs/${e(id)}`, { auth: 'none' }),
};

// ── 드랍
export const dropApi = {
  nearby: (latitude: number, longitude: number, distanceKm: number) =>
    api.get<{ droppings: DropSummary[] }>('/droppings', { query: { latitude, longitude, distance: distanceKm }, auth: 'optional' }).then(r => r.droppings),
  get: (id: UUID) => api.get<DropDetail>(`/droppings/${e(id)}`, { auth: 'optional' }),
  create: (body: CreateDropBody) => api.post('/droppings', body),
  remove: (id: UUID) => api.delete(`/droppings/${e(id)}`),
  vote: (id: UUID, songId: UUID) => api.post(`/droppings/${e(id)}/vote`, { songId }),
  unvote: (id: UUID) => api.delete(`/droppings/${e(id)}/vote`),
};

// ── 좋아요
export const likeApi = {
  toggle: (droppingId: UUID) => api.post<{ liked: boolean }>('/likes', { droppingId }),
  countForDrop: (droppingId: UUID) => api.get<{ likeCount: number }>(`/likes/count/dropping/${e(droppingId)}`).then(r => r.likeCount),
  countMine: () => api.get<{ likeCount: number }>('/likes/count/user').then(r => r.likeCount),
};

// ── 댓글
export const commentApi = {
  list: (droppingId: UUID) => api.get<Comment[]>(`/comments/droppings/${e(droppingId)}`),
  count: (droppingId: UUID) => api.get<number>(`/comments/count/${e(droppingId)}`),
  create: (droppingId: UUID, content: string) => api.post('/comments', { content, droppingId }),
  update: (commentId: UUID, content: string) => api.put(`/comments/${e(commentId)}`, { content }),
  remove: (commentId: UUID) => api.delete(`/comments/${e(commentId)}`),
};

// ── 알림
export const notificationApi = {
  list: (limit = 50) => api.get<{ notifications: AppNotification[] }>('/notifications', { query: { limit } }).then(r => r.notifications),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count').then(r => r.count),
  read: (id: UUID) => api.patch(`/notifications/${e(id)}/read`),
  readAll: () => api.patch('/notifications/read-all'),
};

// ── 플레이리스트
export const playlistApi = {
  mine: () => api.get<{ playlists: PlaylistSummary[] }>('/playlists/my').then(r => r.playlists),
  get: (id: UUID) => api.get<PlaylistDetail>(`/playlists/${e(id)}`),
  create: (name: string) => api.post('/playlists', { name }),
  rename: (id: UUID, name: string) => api.put(`/playlists/${e(id)}`, { name }),
  remove: (id: UUID) => api.delete(`/playlists/${e(id)}`),
  addSongs: (id: UUID, songIds: UUID[]) => api.post(`/playlists/${e(id)}/songs`, { songIds }),
  removeSong: (id: UUID, songId: UUID) => api.delete(`/playlists/${e(id)}/songs/${e(songId)}`),
};

// ── 신고·차단
export const safetyApi = {
  report: (targetType: ReportTarget, targetId: UUID, reason: ReportReason, detail?: string) =>
    api.post('/reports', { targetType, targetId, reason, ...(detail ? { detail } : {}) }),
  block: (userId: UUID) => api.post('/blocks', { userId }),
  blocks: () => api.get<BlockedUser[]>('/blocks'),
  unblock: (userId: UUID) => api.delete(`/blocks/${e(userId)}`),
};
