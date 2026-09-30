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

- Secrets: `API_BASE_URL`, `KAKAO_NATIVE_APP_KEY`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_ANDROID_API_KEY`
- 버전 코드 = 실행 번호라서 새 APK는 기존 설치본 위에 업데이트로 설치된다.
- 서명: `android/app/debug.keystore` (RN 기본 키). Google 로그인·지도·카카오에 이 키의 SHA-1이 등록돼 있다. 스토어 배포 전에는 업로드 키를 만들어 release 서명을 바꾸고 새 SHA-1을 각 콘솔에 추가해야 한다.

## 테스트

```bash
npm test               # 유닛
npm run typecheck && npm run lint
```

- UI 테스트: `ios/PADOUITests` (XCUITest, 목 모드). 미리듣기는 `-PADO_MUTE YES`로 무음.
- `patches/` — react-native-maps 커스텀 마커 패치 (`postinstall`에서 자동 적용).
