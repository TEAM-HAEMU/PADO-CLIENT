/**
 * 푸시(FCM)용 Firebase 설정 파일을 제자리로 복사한다. 두 파일은 레포에 커밋하지 않는다 (.gitignore).
 *   ~/.pado/firebase/GoogleService-Info.plist → ios/PADO/GoogleService-Info.plist (Xcode 'Copy Firebase config' 단계가 앱에 넣음)
 *   ~/.pado/firebase/google-services.json      → android/app/google-services.json (있을 때만 google-services 플러그인 적용)
 * 다른 폴더: PADO_FIREBASE_DIR=/경로 node scripts/firebase-config.js
 * CI는 GitHub 시크릿(GOOGLE_SERVICE_INFO_PLIST_B64 · GOOGLE_SERVICES_JSON_B64)에서 직접 복원한다 (.github/workflows)
 * 파일이 없으면 경고만 — 푸시 없이 빌드된다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = process.env.PADO_FIREBASE_DIR || path.join(os.homedir(), '.pado', 'firebase');
const files = [
  ['GoogleService-Info.plist', 'ios/PADO/GoogleService-Info.plist'],
  ['google-services.json', 'android/app/google-services.json'],
];

for (const [name, dest] of files) {
  const src = path.join(dir, name);
  const out = path.join(root, dest);
  if (!fs.existsSync(src)) {
    console.warn(`[firebase] ${name} 없음 (${dir}) — ${fs.existsSync(out) ? '있던 파일 그대로' : '푸시 없이 빌드돼요'}`);
    continue;
  }
  const data = fs.readFileSync(src);
  if (fs.existsSync(out) && fs.readFileSync(out).equals(data)) {
    console.log(`[firebase] ${dest} 최신`);
    continue;
  }
  fs.writeFileSync(out, data, { mode: 0o600 });
  console.log(`[firebase] ${dest} 복사함`);
}
