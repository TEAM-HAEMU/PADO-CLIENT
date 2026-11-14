# 분석 이벤트 사전

앱이 Amplitude에 보내는 이벤트 목록이다. 코드: `src/services/analytics.ts`(모드·공통 속성·체류 시간), `src/services/usageEvents.ts`(서버 집계).

## 분석 모드

설정 › 안전 · 개인정보의 두 줄로 고른다. 동의창은 띄우지 않는다 (iOS 5.1.2(i) 반려 원인).

| 모드 | 설정 | 기본값 | 보내는 것 |
|---|---|---|---|
| `basic` 기본 이용 분석 | 이용 분석 켜짐, 상세 분석 꺼짐 | 모두 켜짐 | 이벤트 + 기기 정보(기종·OS·앱 버전·언어) + Amplitude가 만든 기기 ID + `region`(시·군·구) |
| `detailed` 상세 분석 | 상세 분석 켜짐 | 꺼짐 | 위에 더해 사용자 ID, 회원 속성(닉네임·성별·출생연도), 정밀 위치 `lat`/`lng`, 세션 리플레이(30% 세션) |
| `off` | 이용 분석 꺼짐 | | 아무것도 안 보냄. 서버 집계(`POST /events`)도 안 보냄 |

- 두 모드 모두 IP·광고 ID(adid·앱 세트 ID)·IDFV·통신사는 SDK에서 끈다 (`trackingOptions`)
- 상세 → 기본으로 내리면 `amplitude.reset()`으로 기기 ID를 새로 만든다. 그 뒤 기록은 예전 사용자와 이어지지 않는다
- 기본 → 상세로 올리면 같은 기기 ID에 사용자 ID가 붙는다 (켠 사람의 선택)
- 목 모드·키 없음이면 보내지 않는다. `AMPLITUDE_IN_MOCK=true`면 목 모드도 보낸다(`app_env = mock`)

### 예전 저장값 옮기기 (`migrateAnalyticsMode`)

| 예전 값 (`prefs`) | 새 모드 |
|---|---|
| `analyticsMode`가 있음 | 그대로 |
| `analyticsAsked: true, analytics: true` (설정에서 직접 켬) | `detailed` |
| `analyticsAsked: true, analytics: false` (직접 끔, 예전 동의창에서 거절 포함) | `off` |
| 고른 적 없음 (새 설치, 예전 기본 켜짐 시절) | `basic` |

## 공통 속성 (모든 이벤트)

| 속성 | 모드 | 내용 |
|---|---|---|
| `app_env` | 모두 | `prod` 또는 `mock` |
| `analytics_mode` | 모두 | `basic` 또는 `detailed` |
| `screen` | 모두 | 이벤트가 난 화면 (내비게이션 route 이름) |
| `region` | 모두 | 시·도 + 시·군·구 (`부산광역시 해운대구`). 지도 화면이 주소를 받은 뒤부터 |
| `lat`, `lng` (+ `location_lat`/`location_lng`) | 상세만 | 마지막 위치, 소수 6자리 |

사용자 속성: `app_env`, `pref_*`(설정값) — 모두. `username`, `gender`, `birth_year` — 상세만.

## 서버 집계 (`POST /events`)

아래 다섯 이벤트는 Amplitude와 별도로 서버에도 합계만 보낸다. 분석을 끈 사람은 보내지 않는다.
이름과 `droppingId`만 보내고 로그인 토큰은 붙이지 않는다. 10초 모아서, 50개가 차면 바로, 앱이 백그라운드로 갈 때 보낸다.
네트워크 오류·5xx는 다음에 다시, 404(서버 배포 전)·4xx는 버린다.

`app_opened`, `drop_opened`, `preview_started`, `drop_locked_tap`, `share_opened`

## 이벤트

모드 열: 둘 다 = 기본·상세 모두. 속성 중 상세에서만 붙는 것은 따로 적었다.

### 앱 · 화면

| 이벤트 | 언제 | 속성 | 서버 |
|---|---|---|---|
| `first_open` | 설치 후 처음 실행 (기기 기준) | | |
| `app_opened` | 앱 실행, 또는 5분 넘게 백그라운드에 있다 돌아옴 | `cold` (실행이면 true) | 예 |
| `screen_viewed` | 화면이 바뀜 (같은 route key면 한 번) | `screen`, 화면 파라미터의 ID(`dropId`·`songId`·`playlistId`) | |
| `screen_left` | 화면을 떠남, 앱이 백그라운드로 감 | `screen`, `duration_ms`, `reason`(`navigate`·`background`) | |
| `tap` | `Press`로 만든 모든 버튼 | `label`, `kind`(`press`·`long_press`) | |
| `session_start` / `session_end` | Amplitude 세션 (5분) | | |
| `api_error` | API가 2xx가 아님 | `method`, `path`(ID는 `:id`), `status`, `code` | |
| `setting_changed` | 설정 변경 | `key`, `value` | |

`tap.label`: `trackAs` → 접근성 라벨 → testID → 버튼 글자 순. 숫자는 `#`으로 바뀐다 (`좋아요 #개`).
닉네임·곡명·플리 이름이 들어가는 버튼은 `trackAs`로 고정 라벨을 준다 (`내 드랍`, `곡 행`, `알림 항목` 등).

### 가입 · 로그인

| 이벤트 | 언제 | 속성 |
|---|---|---|
| `onboarding_completed` | 소개 3장을 처음 끝냄 | `page` |
| `login_started` | 소셜 버튼 / 이메일 로그인 누름 | `method`(`kakao`·`google`·`apple`·`email`) |
| `login_cancelled` | 소셜 로그인 창을 닫음 | `method` |
| `login_failed` | 로그인 실패 | `method`, `code` |
| `login_completed` | 로그인 성공 | `method` |
| `sign_up_started` | 가입 화면 열림 (새 소셜 계정·이메일 가입) | `method` |
| `sign_up_failed` | 가입 실패 | `method`, `code` |
| `sign_up_completed` | 가입 성공 | `method` |
| `password_reset_completed` | 비밀번호 재설정 끝 | |
| `logout` | 로그아웃 | `by`(`user`·`session_end`) |
| `account_withdrawn` | 탈퇴 | `drops` |

### 위치 · 지도

| 이벤트 | 언제 | 속성 | 서버 |
|---|---|---|---|
| `location_permission_result` | 위치 권한 요청 결과 | `result`(`granted`·`denied`), `was`(요청 전 상태) | |
| `location_unavailable` | 첫 위치를 못 받음 | `reason`(`denied`·`off`·`timeout`) | |
| `map_loaded` | 앱 실행마다 지도에 주변 드랍이 처음 뜸 | `nearby_count`, `playable_count`, `locked_count`, `nearest_m`, `nearest_playable_m`, `display_m`, `play_m` | |
| `drop_locked_tap` | 재생 반경 밖 드랍을 누름 | `drop_id`, `type`, `source`, `distance_m`, `remaining_m` | 예 |

### 드랍 · 듣기

| 이벤트 | 언제 | 속성 | 서버 |
|---|---|---|---|
| `drop_opened` | 드랍 상세(음악 미리보기·투표·플리)를 받아 보여 줌, 화면마다 한 번 | `drop_id`, `type`, `source`(`map_pin`·`map_list`·`notification`·`profile`·`playlists`·`link`), `distance_m` | 예 |
| `preview_started` | 새 곡 미리듣기 시작 | `song_id`, `title`, `artist`, `drop_id`(드랍에서 들으면), `autoplay` | 예 |
| `preview_paused` / `preview_resumed` | 일시정지·이어 듣기 | `song_id`, `position` | |
| `preview_completed` | 30초 끝까지 | `song_id` | |
| `nearby_autoplay_play` / `nearby_autoplay_next` | 주변 곡 자동 재생 | `drop_id`, `song_id`, `nearby_count`, `handoff` | |
| `full_listen_clicked` | 전체 듣기(음악 앱) | `service`, `song_id`, `title`, `artist` | |
| `drop_liked` / `drop_unliked` | 좋아요 | `drop_id` | |
| `comment_created` / `comment_edited` / `comment_deleted` | 댓글 | `drop_id`, `length` | |
| `vote_cast` / `vote_cancelled` | 투표 | `drop_id`, `song_id`, `changed` | |

### 드랍 남기기 · 공유

| 이벤트 | 언제 | 속성 | 서버 |
|---|---|---|---|
| `drop_created` | 드랍 생성 성공 | `type`, `note_length`, `song_id`, `option_count`, `playlist_new`, `first_drop`, `region` / 상세만: `address`, `lat`, `lng` | |
| `first_drop_created` | 그 계정의 첫 드랍 (내 드랍 목록이 비어 있었음) | `type` | |
| `share_opened` | 공유 시작 (드랍 메뉴·드랍 완료·곡 메뉴) | `kind`(`drop`·`song`), `drop_id`, `song_id`, `source` | 예 |
| `share_card` | 공유 카드 내보내기 | `target`, `style` | |

### 알림 · 플리 · 안전

| 이벤트 | 언제 | 속성 |
|---|---|---|
| `notification_opened` | 알림 항목 누름 | `event`(알림 종류), `unread`, `has_drop` |
| `playlist_created` / `playlist_deleted` / `playlist_songs_added` / `playlist_song_removed` | 플리 | `playlist_id`, `count`, `source` 등 |
| `report_submitted` | 신고 | `target_type`, `reason`, `has_detail`, `block` |
| `user_blocked` / `user_unblocked` | 차단 | `source` |

## 이벤트를 더할 때

- 정밀 위치·주소·닉네임처럼 사람이나 자리를 알 수 있는 값은 `detailedOnly({...})`로 감싼다
- 버튼 글자에 사용자가 쓴 내용이 들어가면 `Press`에 `trackAs`를 준다
- 서버에서도 세야 하는 숫자면 백엔드 허용 목록과 `SERVER_EVENTS`에 같이 넣는다
- 이 문서와 `docs/amplitude-charts.md`를 같이 고친다
