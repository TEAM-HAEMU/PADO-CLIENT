# PADO

거리에 음악을 흘려두고, 누군가의 하루에 닿게. — 위치 기반 음악 드랍 앱.

React Native 0.87 (New Architecture) · TypeScript · NativeWind · Reanimated · React Navigation · TanStack Query · zustand

## 실행

```bash
npm install
npm run pods          # iOS
cp .env.example .env  # 키 채우기 (아래)
npm run ios           # 또는 npm run android
```

- `USE_MOCK=true`면 내장 목 서버로 계정·키 없이 전 화면 확인 (이메일 로그인에 목 계정이 채워져 있음).
- 실제 iPhone: `TEAM_ID=<팀 ID> npm run ios:device` (Xcode에 Apple ID 필요).

## 키 (`.env`)

`.env`는 커밋하지 않는다. `npm run env:sync`(ios/android 실행 전 자동)가 키를 `ios/PADO/Info.plist`, `android/app/src/main/res/values/strings.xml`에 채워 넣으므로, 클론한 뒤 한 번 아래를 실행해 두 파일의 로컬 변경이 커밋되지 않게 한다.

```bash
git update-index --skip-worktree ios/PADO/Info.plist android/app/src/main/res/values/strings.xml
```

레포의 두 파일에는 `unset` 값만 들어 있다. 두 파일 자체를 고쳐야 할 때는 `--no-skip-worktree`로 풀고 `node scripts/sync-native-env.js <빈 파일>`로 값을 비운 뒤 커밋한다.

## CI · APK

`.github/workflows/android.yml` — `main`에 푸시되면 검사(tsc · eslint · jest) → 실서버용 release APK(arm64) 빌드 → **Releases**에 `PADO 1.0.<실행 번호>`로 올라간다 (가장 최신은 Latest). PR은 검사와 빌드만 한다.

- Secrets: `API_BASE_URL`, `KAKAO_NATIVE_APP_KEY`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_ANDROID_API_KEY`, `AMPLITUDE_API_KEY`
- 버전 코드 = 실행 번호라서 새 APK는 기존 설치본 위에 업데이트로 설치된다.
- 서명: `android/app/debug.keystore` (RN 기본 키). Google 로그인·지도·카카오에 이 키의 SHA-1이 등록돼 있다. 스토어 배포 전에는 업로드 키를 만들어 release 서명을 바꾸고 새 SHA-1을 각 콘솔에 추가해야 한다.

## 분석 (Amplitude)

`src/services/analytics.ts` — 화면 조회·체류 시간 · 모든 버튼 탭(`Press`) · 가입부터 첫 드랍까지의 핵심 행동. 두 단계로 나뉜다.

- 기본 이용 분석(기본 켜짐): 기기 단위 익명, 사용자 ID·정밀 위치·세션 리플레이 없음, 지역은 시·군·구까지
- 상세 분석(설정에서 직접 켠 사람만): 사용자 ID · 정밀 위치 · 세션 리플레이(입력칸 가림, 세션 30% 샘플링)

실서버 빌드에서 `AMPLITUDE_API_KEY`가 있을 때만 보내고, 설정 › 이용 분석에서 끌 수 있다. 동의창은 띄우지 않는다.
앱 열기·드랍 열기·미리듣기·잠금 탭·공유는 서버(`POST /events`)에도 합계만 보낸다. 이벤트 목록은 [docs/analytics-events.md](docs/analytics-events.md), 차트 만드는 법은 [docs/amplitude-charts.md](docs/amplitude-charts.md).

## 오류 진단 (Sentry)

`src/services/monitoring.ts` · `src/services/monitoringRules.ts` — JS 오류 · 네이티브 충돌(iOS, Android NDK) · 앱 멈춤(iOS app hang, Android ANR) · 앱 시작/화면 전환 성능(샘플 10%). Sentry DE 리전(`de.sentry.io`), 조직 `busansoftwaremeisterhighschool` · 프로젝트 `react-native`.

- 켜는 조건: `.env`의 `SENTRY_DSN`이 있고 실서버 릴리스 빌드일 때. 목 모드·개발 빌드는 기본으로 끈다 (검증할 때만 `SENTRY_IN_MOCK=true`·`SENTRY_IN_DEV=true`, environment가 `mock`·`dev`로 따로 찍힘. 운영은 `prod`)
- 설정 › 이용 분석을 **끔**으로 둔 사람은 보내지 않는다 (그 자리에서 SDK를 닫음). 오류 진단은 처리방침에 '안정성 개선'으로 따로 고지돼 있어 기본 분석·상세 분석 어느 쪽이든 똑같이 보낸다 — 상세 분석이라고 더 보내는 것은 없다
- 보내는 것: 오류 내용·스택, 발생 화면(화면 이름), 직전 앱 내 동작 기록(화면 이동·탭·API 실패 `METHOD /경로/:id 상태`), 기기 정보(OS·기종·앱 버전), 요청 ID
- 보내지 않는 것: 사용자 ID·IP(`sendDefaultPii: false`, 이벤트의 `user` 삭제) · 세션 리플레이 · 스크린샷 · 뷰 계층 · 요청/응답 본문 · Authorization 헤더 · 토큰 · 이메일 · 위도·경도 · 도로명/지번 주소 · URL 쿼리. 걸러내기는 `beforeSend`/`beforeBreadcrumb`/`beforeSendTransaction` (테스트: `__tests__/monitoring.test.ts`). 네이티브 HTTP 브레드크럼은 껐다 (쿼리에 위치가 남음)
- 화면을 그리다 난 오류는 최상단 `Sentry.ErrorBoundary`가 받아 '잠시 문제가 생겼어요 · 다시 불러오기' 화면을 띄운다 (`src/components/AppErrorFallback.tsx`)
- release = `번들ID@버전+빌드`, dist = 빌드 번호 (네이티브 기본값 — 소스맵·심볼 업로드 이름과 같아야 스택이 풀린다)

### 요청 ID (`X-Request-Id`)

API 요청마다 UUID v4를 만들어 `X-Request-Id`로 보낸다 (`src/api/requestId.ts`, 서버 형식 `[A-Za-z0-9-]{8,64}`). 서버(RequestLoggingFilter)가 로그 모든 줄에 `requestId`로 남기고 응답 헤더로 돌려준다. 실패한 요청의 같은 값이

- `ApiError.requestId` (디버깅)
- Amplitude `api_error.request_id`
- Sentry 브레드크럼 `api`(`data.request_id`) · 5xx면 Sentry 이벤트(태그 `request_id`, 묶음 키 `api METHOD 경로 상태`)

에 붙는다. 사용자가 본 오류 → Sentry 이벤트 → 서버 로그 한 줄을 ID 하나로 찾는다. 4xx·네트워크 끊김은 정상 흐름이 많아 브레드크럼만 남긴다.

### 릴리스 빌드의 소스맵·심볼 업로드

Release 빌드는 JS 소스맵(iOS·Android), dSYM(iOS), NDK 심볼(Android)을 Sentry에 올린다. Debug 빌드는 올리지 않는다. 인증 토큰(`org:ci` 권한)은 레포에 두지 않는다.

```bash
npm run sentry:props   # ~/.pado/sentry.env → ios/sentry.properties, android/sentry.properties (둘 다 .gitignore)
```

또는 빌드하는 셸에 환경변수로 준다: `SENTRY_AUTH_TOKEN` (필수), `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_URL` (없으면 위 기본값).

- 토큰이 없으면 업로드만 건너뛰고 경고를 낸다 — 빌드는 실패하지 않는다 (그 빌드의 스택은 Sentry에서 풀리지 않음)
- iOS: `Bundle React Native code and images` 단계가 `sentry-xcode.sh`로 번들+소스맵을, `Upload Debug Symbols to Sentry` 단계가 dSYM을 올린다. 판단은 `scripts/sentry-xcode-env.sh`. 토큰이 있을 때 업로드가 실패해도 경고로 넘기고(`SENTRY_ALLOW_FAILURE`), 대신 `main.jsbundle`이 실제로 만들어졌는지 확인한다
- Android: `@sentry/react-native/sentry.gradle`(소스맵) + Sentry Android Gradle Plugin(NDK 심볼). 토큰이 있는데 업로드가 실패하면 Gradle 빌드가 실패한다 — 급할 땐 `SENTRY_DISABLE_AUTO_UPLOAD=true`
- 끄기: `SENTRY_DISABLE_AUTO_UPLOAD=true`
- CI(`android.yml`)는 Secrets `SENTRY_DSN`·`SENTRY_AUTH_TOKEN`이 있으면 쓴다 (없으면 DSN 없는 빌드 · 업로드 건너뜀)

## 테스트

```bash
npm test               # 유닛
npm run typecheck && npm run lint
```

- UI 테스트: `ios/PADOUITests` (XCUITest, 목 모드). 미리듣기는 `-PADO_MUTE YES`로 무음.
- `patches/` — react-native-maps 커스텀 마커 패치 (`postinstall`에서 자동 적용).
