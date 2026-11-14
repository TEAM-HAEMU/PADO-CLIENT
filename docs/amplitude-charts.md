# Amplitude 차트 만들기

`docs/analytics-events.md`의 이벤트로 만드는 기본 차트 묶음이다. 모두 Amplitude 웹에서 직접 만든다 (API로 만들 수 없다).
만든 차트는 대시보드 하나(`PADO 이용 분석`)에 모으고, 그 주소를 어드민 환경변수 `AMPLITUDE_DASHBOARD_URL`에 넣으면 어드민 대시보드에 링크가 뜬다.

## 공통 설정

- 모든 차트에 필터 `app_env = prod` (목·시연 데이터 제외)
- 기본 모드는 사용자 ID 없이 기기 ID로만 센다. Amplitude의 "사용자"는 기기 하나라고 보고 읽는다. 상세 분석을 켠 사람만 로그인 계정과 이어진다
- 서버 집계(`POST /events`)는 분석을 끈 사람을 뺀 전체 합계라 Amplitude 숫자보다 크다. 전체 횟수는 어드민 대시보드, 비율·흐름은 Amplitude로 본다
- 출시 직후엔 표본이 작다. 비율을 쓸 때는 기간과 기기 수를 같이 적는다

## 1. 가입 → 첫 드랍 퍼널

Funnel Analysis

1. Events에 순서대로 넣는다
   1. `first_open`
   2. `onboarding_completed`
   3. `sign_up_started`
   4. `sign_up_completed`
   5. `location_permission_result` (where `result = granted`)
   6. `map_loaded`
   7. `drop_opened`
   8. `preview_started`
   9. `first_drop_created`
2. Conversion window: 7 days, 순서: This order
3. Group by: 4단계 `sign_up_completed`의 `method` (가입 방법별 비교)
4. 저장 이름: `가입 → 첫 드랍`

같은 방식으로 짧은 활성화 퍼널도 하나 더 만든다: `app_opened` → `map_loaded`(where `playable_count > 0`) → `drop_opened` → `preview_started` → `full_listen_clicked`. 이름 `열기 → 전체 듣기`.

## 2. 화면별 체류 시간

Event Segmentation

1. Event: `screen_left`
2. Measured as: Properties → `duration_ms` → Average (중앙값을 보려면 같은 차트를 Distribution으로 하나 더)
3. Where: `duration_ms < 1800000` (30분 넘는 값은 켜 둔 채 둔 것이라 뺀다)
4. Group by: `screen`
5. 표시: Bar chart, 기간 최근 30일
6. 저장 이름: `화면별 평균 체류 (ms)`. 초로 보려면 Formula `PROPAVG(A) / 1000`

## 3. 이탈 화면

앱을 내린 화면을 센다.

1. Event Segmentation, Event: `screen_left` where `reason = background`
2. Measured as: Uniques
3. Group by: `screen`, 상위 15개
4. 저장 이름: `앱을 내린 화면`

요금제에 Journeys(Pathfinder)가 있으면 하나 더: Journeys → Ending event `session_end` → 바로 앞 이벤트를 `screen_viewed`로 두고 `screen` 속성으로 나눈다. 세션이 끝나기 직전에 본 화면 순위다.

가입 중 이탈은 1번 퍼널의 단계별 이탈 수로 본다.

## 4. 버튼 탭 순위

1. Event Segmentation, Event: `tap`
2. Measured as: Event Totals (한 번 더 만들어 Uniques)
3. Group by: `label`, 상위 30개. 화면별로 보려면 Group by에 `screen`을 먼저 둔다
4. 표시: Bar chart, 최근 30일
5. 저장 이름: `버튼 탭 순위`

`label`은 고정 라벨이다. `unlabeled`가 많이 보이면 그 화면 버튼에 `trackAs`를 붙인다.

## 5. 리텐션

Retention Analysis

1. Starting event: `first_open` (가입자 기준으로 보려면 `sign_up_completed`로 하나 더)
2. Return event: `app_opened`
3. N-Day retention, Day 1 · 7 · 14 · 30
4. 저장 이름: `첫 실행 후 재방문`

## 6. 반경 관련 분포

운영자가 어드민에서 표시·재생 반경을 바꾼 효과를 본다.

1. 열 수 있는 드랍 수
   - Event Segmentation, Event: `map_loaded`, Measured as: Event Totals
   - Group by: `playable_count`, Numeric bucket 0 / 1–2 / 3–5 / 6–10 / 11+
   - 이름 `지도 첫 화면의 열 수 있는 드랍 수`
2. 빈 지도 비율
   - Event Segmentation, A: `map_loaded`, B: `map_loaded` where `playable_count = 0`
   - Formula `UNIQUES(B) / UNIQUES(A)`
   - 이름 `열 수 있는 드랍이 없는 첫 화면 비율`
3. 잠금 탭 거리
   - Event: `drop_locked_tap`, Group by `remaining_m`, bucket 0–50 / 50–200 / 200–500 / 500–1000 / 1000+
   - 이름 `잠긴 드랍까지 남은 거리`
4. 드랍을 연 거리
   - Event: `drop_opened`, Group by `distance_m` (bucket 0–100 / 100–300 / 300–500 / 500+), 두 번째 Group by `source`
5. 반경 값별 비교
   - 1번 차트에 Group by `play_m`을 더하면 재생 반경 값이 바뀐 앞뒤를 나눠 볼 수 있다

## 7. 대시보드

Dashboards → New → `PADO 이용 분석`에 위 차트를 모두 넣고, 공유 링크(Share → Copy link)를 어드민의 `AMPLITUDE_DASHBOARD_URL`에 넣는다.

## Amplitude 프로젝트 설정 (사람이 확인)

- 앱은 IP를 보내지 않지만(`trackingOptions.ipAddress = false`) Amplitude 서버가 요청 IP로 지역을 추정할 수 있다. 프로젝트 설정에서 IP 수집·IP 기반 위치를 끄는 항목이 있으면 끈다
- 데이터 보관 기간을 처리방침과 같이 1년으로 맞춘다 (요금제에 설정이 있으면)
- 세션 리플레이 월 한도와 샘플링(`AMPLITUDE_REPLAY_SAMPLE_RATE`, 기본 0.3)을 확인한다. 상세 분석을 켠 사람만 녹화된다

## 스토어 개인정보 표시 (사람이 직접 바꿔야 함)

API로는 바꿀 수 없다. 이 기능이 들어간 빌드를 심사에 내기 전에 바꾼다.

### App Store Connect › 앱 개인정보 보호

| 데이터 유형 | 목적 | 사용자에게 연결 | 추적 | 바뀐 점 |
|---|---|---|---|---|
| 사용 데이터 › 제품 상호 작용 | 분석 | 예 (상세 분석은 사용자 ID와 연결) | 아니요 | 이제 기본으로 모두에게서 수집 |
| 위치 › 대략적인 위치 | 분석 | 예 (상세 분석이면 연결) | 아니요 | 새로 추가 (시·군·구) |
| 위치 › 정확한 위치 | 앱 기능, 분석 | 예 | 아니요 | 분석은 상세 분석만 (그대로) |
| 식별자 › 기기 ID | 분석 | 예 | 아니요 | 기본 모드도 수집 (Amplitude 기기 ID, IDFA 아님) |
| 식별자 › 사용자 ID | 앱 기능, 분석 | 예 | 아니요 | 분석은 상세 분석만 |
| 진단 › 기타 진단 데이터 | 분석 | 예 | 아니요 | API 오류 기록, 기본 모드도 수집 |

- "추적"은 계속 아니요. ATT를 쓰지 않고, 광고 목적으로 다른 회사 데이터와 합치지 않는다
- 기본 모드만 보면 "연결 안 됨"이지만 같은 데이터가 상세 분석에서 사용자 ID와 연결되므로 "연결됨"으로 적는다 (보수적으로)
- 심사 메모에 한 줄: 분석은 기기 단위 익명이 기본이고, 계정·정확한 위치·세션 리플레이는 설정에서 직접 켠 사람만 보낸다. 동의창은 없다

### Play Console › 앱 콘텐츠 › 데이터 보안

`store/play/submission-checklist.md` 표 기준으로 아래를 바꾼다.

| 데이터 유형 | 수집 | 필수/선택 | 목적 | 바뀐 점 |
|---|---|---|---|---|
| 앱 활동 · 앱 상호작용 | 예 | 선택 (설정에서 끌 수 있음) | 분석 | 기본 켜짐으로 |
| 위치 · 대략적인 위치 | 예 | 선택 | 분석 | 새로 추가 |
| 위치 · 정확한 위치 | 예 | 필수 | 앱 기능, 분석(상세 분석만) | 그대로 |
| 기기 또는 기타 ID | 예 | 선택 | 분석 | 기본 켜짐으로 |
| 앱 정보 및 성능 · 진단 | 예 | 선택 | 분석 | 기본 켜짐으로 |

- 제3자 공유: 아니요 (Amplitude는 서비스 제공업체)
- 전송 중 암호화: 예
