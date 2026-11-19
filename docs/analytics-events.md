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

아래 여섯 이벤트는 Amplitude와 별도로 서버에도 합계만 보낸다. 분석을 끈 사람은 보내지 않는다.
이름과 `droppingId`(Amplitude `drop_id`), `push_opened`면 `noticeId`(Amplitude `notice_id`, 운영자 발송 알림일 때만)만 보내고 로그인 토큰은 붙이지 않는다.
10초 모아서, 50개가 차면 바로, 앱이 백그라운드로 갈 때 보낸다.
네트워크 오류·5xx는 다음에 다시, 404(서버 배포 전)·4xx는 버린다.

`app_opened`, `drop_opened`, `preview_started`, `drop_locked_tap`, `share_opened`, `push_opened`

- 서버는 일별 합계와 함께 시간별 합계(`event_hourly_counts`, 드랍 ID 없음)도 센다. 어드민의 알림 효과(보낸 뒤 24시간 vs 지난주 같은 시간)가 이 값을 쓴다
- `push_opened` + `noticeId`면 서버가 그 알림의 누른 수(`push_notices.open_count`)를 1 올린다. 누가 눌렀는지는 저장하지 않는다
- `noticeId`는 UUID일 때만 보낸다 (잘못된 값으로 묶음 전체가 400으로 버려지지 않게)

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
| `setting_changed` | 설정 변경 | `key`, `value`. 알림 토글은 `notify_like`·`notify_comment`·`notify_nearby`·`notify_notice`·`notify_marketing`(혜택·소식 — 설정 토글과 가입 직후 알림 안내의 체크) | |

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
| `location_first_fix` | 믿을 만한 좌표 없이 위치 감시를 시작해 처음 '지금 위치'(2분 안)를 받음. 회차마다 한 번 (좌표를 들고 잠깐 백그라운드에 다녀온 회차는 안 셈) | `wait_ms`(감시 시작부터 받기까지, '신호 약함'을 띄운 뒤 받은 것도 포함), `accuracy_m`(오차, 모르면 null), `age_ms`(받은 위치의 나이), `source`(`quick` 기기가 잡아 둔 위치·`watch` 감시), `trigger`(`start` 처음·`foreground` 앱으로 돌아옴·`retry` 권한·위치 서비스를 켠 뒤 다시) | |
| `map_loaded` | 앱 실행마다 지도에 주변 드랍이 처음 뜸 | `nearby_count`, `playable_count`, `locked_count`, `nearest_m`, `nearest_playable_m`, `display_m`, `play_m`, `visibility_mode`, `region_unit`, `play_mode` | |
| `scope_tip_shown` | 보기·재생 범위가 바뀌어 지도 지역 이름 아래 안내를 띄움 (설정이 바뀔 때마다 한 번) | `visibility_mode`, `region_unit`, `play_mode`, `play_region_unit` | |
| `drop_locked_tap` | 재생 반경 밖 드랍을 골라 말풍선(잠금 안내)을 띄움. `source`: `map_pin`(핀) · `map_list`(하단 목록). 고를 때 한 번만 — 이미 고른 드랍을 또 눌러도 다시 세지 않음 | `drop_id`, `type`, `source`, `distance_m`, `remaining_m` | 예 |
| `map_cluster_tap` | 많이 축소한 지도에서 드랍 묶음을 눌러 확대 | `count`(묶음의 드랍 수) | |
| `map_list_tap` / `map_pin_tap` | 하단 목록(`map_list_tap`)·지도 핀(`map_pin_tap`)에서 드랍을 골라 지도가 그 핀으로 옮겨 가고 말풍선이 뜸 (이미 고른 드랍을 다시 누른 것은 `map_bubble_open`으로만 셈). 잠긴 드랍이면 같은 순간 `drop_locked_tap`도 나므로 두 이벤트를 더하지 않는다 | `drop_id`, `type`, `locked` | |
| `map_bubble_open` | 말풍선이 떠 있는 드랍의 자세히 화면을 엶 — 말풍선을 누름(`bubble`) · 말풍선이 떠 있는 핀을 다시 누름(`pin`) · 목록에서 같은 드랍을 한 번 더 누름(`list`). 잠긴 드랍은 열리지 않아 안 난다. 말풍선으로 연 상세의 `drop_opened`는 `source=map_bubble`(핀·목록으로 연 것은 각각 `map_pin`·`map_list`) | `drop_id`, `via`(`bubble`·`pin`·`list`) | |

### 드랍 · 듣기

| 이벤트 | 언제 | 속성 | 서버 |
|---|---|---|---|
| `drop_opened` | 드랍 상세(음악 미리보기·투표·플리)를 받아 보여 줌, 화면마다 한 번 | `drop_id`, `type`, `source`(`map_pin`·`map_list`·`notification`(알림 화면·푸시)·`profile`·`playlists`·`link`), `distance_m` | 예 |
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
| `push_permission_result` | 알림(OS) 권한 요청 결과 | `result`(`granted`·`denied`·`unknown`), `was`(요청 전 상태), `source`(`onboarding` 가입 직후 안내·`prompt` 기존 사용자 새 버전 안내·`settings` 설정 › 알림) |
| `push_opened` | 푸시 알림을 눌러 앱을 엶 (꺼져 있을 때·백그라운드·앞에 있을 때 모두). 서버 집계 대상 | `type`(`comment`·`like`·`nearby`·`notice`, 모르는 값은 그대로), `has_drop`(드랍을 열었는지), 운영자 발송(`notice`)만: `kind`(`NOTICE` 운영 공지·`AD` 혜택·소식), `target`(`DROP`·`CREATE_DROP`·`MAP`·`MY_PLAYLISTS`·`MY`·`DROP_OR_INBOX`, 옛 서버면 없음), `notice_id` |
| `playlist_created` / `playlist_deleted` / `playlist_songs_added` / `playlist_song_removed` | 플리 | `playlist_id`, `count`, `source` 등 |
| `report_submitted` | 신고 | `target_type`, `reason`, `has_detail`, `block` |
| `user_blocked` / `user_unblocked` | 차단 | `source` |

### 앱 업데이트

`GET /settings/app-version` 기준과 앱 버전을 비교해 띄우는 안내 (`src/services/appUpdate.ts`). 필수 = 지금 버전 < `minVersion`(앱을 쓸 수 없게 막는 화면), 선택 = < `latestVersion`(지도 위 시트).

| 이벤트 | 언제 | 속성 |
|---|---|---|
| `app_update_prompt_shown` | 필수 업데이트 화면 또는 선택 업데이트 시트가 뜸 (선택은 실행마다 최대 한 번) | `kind`(`required`·`optional`), `latest_version`, `current_version` |
| `app_update_clicked` | '업데이트'를 누름 (iOS App Store, Android Play 인앱 업데이트 → 안 되면 Play 스토어) | `kind`, `latest_version` |
| `app_update_dismissed` | 선택 시트를 '나중에'·배경 탭·쓸어내리기·뒤로가기로 닫음 — 이 `latest_version`은 다시 띄우지 않음 | `latest_version` |

## 이벤트를 더할 때

- 정밀 위치·주소·닉네임처럼 사람이나 자리를 알 수 있는 값은 `detailedOnly({...})`로 감싼다
- 버튼 글자에 사용자가 쓴 내용이 들어가면 `Press`에 `trackAs`를 준다
- 서버에서도 세야 하는 숫자면 백엔드 허용 목록과 `SERVER_EVENTS`에 같이 넣는다
- 이 문서와 `docs/amplitude-charts.md`를 같이 고친다
