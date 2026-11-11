# 출시 뒤 수치 보는 법

출시 뒤 설치 수, 안정성, 드랍 수 같은 수치를 어디서 어떻게 보는지 정리했다. 이력서나 발표에 쓸 때는 **출처와 기간, 기준(전체 또는 동의한 사용자)** 을 같이 적는다. 숫자는 실제로 조회한 값만 쓴다.

## 한눈에

| 수치 | 어디서 | 기준 | 비고 |
|---|---|---|---|
| iOS 다운로드(첫 다운로드) | App Store Connect › 분석 › 획득, 또는 판매 및 추세 › 단위 | 전체 | Apple이 집계한다. 앱 쪽 동의와 무관하다 |
| iOS 세션, 활성 기기 | App Store Connect › 분석 › 사용 | 개발자와 공유에 동의한 기기만 | 절대값보다 추이를 보는 용도 |
| iOS 크래시 | Xcode › Organizer › Crashes, App Store Connect › 분석 › 사용 › 충돌 | 공유에 동의한 기기만 | 크래시 없는 세션 비율은 아래 계산법 참고 |
| Android 설치 | Play Console › 통계 › 설치 기기, 사용자 획득 | 전체 | |
| Android 비정상 종료율 | Play Console › Android vitals › 비정상 종료 | Play가 집계하는 사용자 | 사용자가 인지한 비정상 종료율과 ANR 비율 |
| 가입자, 드랍 수, 드랍한 사람 수 | 서버 DB 집계 (백엔드) | 전체 | 서비스 운영 데이터의 합계라 분석 동의와 무관하다 |
| 퍼널 (미리듣기 → 전체 듣기, 드랍 생성 등) | Amplitude | **분석을 켠 사용자만** | 기본이 꺼짐이라 표본이 작다. 비율만 쓰고 "분석 동의 사용자 기준"이라고 적는다 |

## 분석 동의 정책 (지켜야 할 것)

- 앱은 사용자를 추적하지 않는다. ATT도 쓰지 않는다. Amplitude는 **기본 꺼짐**이고 설정 › 이용 데이터 분석에서 사용자가 직접 켠다 (iOS 심사 5.1.2 대응).
- 그래서 Amplitude 숫자를 전체 사용자 수처럼 쓰면 안 된다. 전체 수치는 스토어 집계나 서버 DB에서 가져온다.
- 서버 DB 집계는 개인을 식별하지 않는 **합계만** 뽑는다. 이메일이나 닉네임 목록을 밖으로 꺼내지 않는다.
- 기본값을 켜기로 바꾸거나 동의창을 다시 넣으면 iOS 재심사 사유가 되므로 하지 않는다.

## iOS: App Store Connect

### 다운로드
- **분석 › 획득**: 첫 다운로드, 재다운로드, 노출, 제품 페이지 조회, 전환율. 기간을 정해 기간별로 본다.
- **판매 및 추세 › 단위**: 일별과 국가별 설치 단위. 무료 앱도 집계된다.
- 하루쯤 늦게 반영된다. 출시일 다음 날부터 본다.

### 크래시 없는 세션 비율
App Store Connect는 비율을 바로 보여주지 않는다. 같은 기간, 같은 기준(공유에 동의한 기기)의 두 숫자로 계산한다.

```
크래시 없는 세션 비율 = 1 − (충돌 수 ÷ 세션 수)
```

- 세션 수: 분석 › 사용 › 세션
- 충돌 수: 분석 › 사용 › 충돌 (또는 Xcode Organizer의 기간별 크래시 수)
- 세션이 적으면(수백 회 미만) 비율이 크게 흔들린다. 기간과 표본 크기를 같이 적는다.

### API로 자동 수집 (선택)
- App Store Connect API의 **Analytics Reports** (`POST /v1/analyticsReportRequests`, `accessType: ONGOING`)를 한 번 만들어 두면 다운로드, 세션, 크래시 리포트가 매일 쌓인다. 기존 API 키(관리자 권한)로 만들 수 있다.
- 요청을 만든 뒤부터 리포트가 생성되므로 출시 전에 만들어 두는 게 좋다. 만들지는 아직 정하지 않았다 (계정 설정에 남는 작업이라 사람이 결정).

## Android: Play Console

- **통계**: 설치 기기, 신규 사용자, 이탈 사용자. 국가와 기기별로 나눠 볼 수 있다.
- **Android vitals**: 사용자가 인지한 비정상 종료율과 ANR 비율. Play 기준선(비정상 종료 1.09%, ANR 0.47%)과 비교할 수 있다.

## 서버 DB (백엔드에 요청)

앱 API에는 전체 통계 엔드포인트가 없다. 백엔드 담당에게 아래 합계를 요청한다. 테이블과 컬럼 이름은 백엔드 스키마에 맞게 바꾼다.

```sql
-- 기간: 출시일 ~ 오늘 (KST)
-- 가입자 수 (탈퇴 제외)
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;
-- 드랍 수 (종류별)
SELECT type, COUNT(*) FROM dropping WHERE created_at >= :launch GROUP BY type;
-- 한 번이라도 드랍한 사람 수
SELECT COUNT(DISTINCT user_id) FROM dropping WHERE created_at >= :launch;
-- 좋아요, 댓글 수
SELECT COUNT(*) FROM likes WHERE created_at >= :launch;
SELECT COUNT(*) FROM comments WHERE created_at >= :launch;
```

- 출시 전 테스트 계정과 심사용 데모 계정은 빼고 센다.
- 결과는 날짜와 함께 숫자만 받는다.

## Amplitude (분석을 켠 사용자만)

앱이 보내는 주요 이벤트: `preview_started`, `preview_completed`, `full_listen_clicked`, `drop_created`, `vote_cast`, `comment_created`, `share_opened`, `report_submitted`, `password_reset_completed` 등.

- 퍼널 예: `preview_started` → `full_listen_clicked` (미리듣기에서 전체 듣기로 넘어간 비율)
- `app_env = prod`로 걸러 목(시연) 데이터를 뺀다.
- 표본이 작으면 쓰지 않는다. 쓸 때는 "분석에 동의한 사용자 N명 기준"이라고 적는다.

## 이력서에 쓸 때

- 숫자 옆에 출처와 기간을 붙인다. 예: "출시 4주 첫 다운로드 ○○회 (App Store Connect)"
- 크래시 없는 세션 비율은 표본 크기를 같이 적는다. 예: "크래시 없는 세션 99.○% (공유 동의 기기 ○○○세션, 4주)"
- 조회하지 않은 숫자는 쓰지 않는다.
