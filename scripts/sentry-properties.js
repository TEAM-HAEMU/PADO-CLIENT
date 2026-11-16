/**
 * Sentry 업로드 설정 파일 만들기 — 릴리스 빌드가 소스맵(JS)·dSYM(iOS)·네이티브 심볼(Android)을 올릴 때 쓴다.
 *
 *   npm run sentry:props                      ~/.pado/sentry.env 에서 읽기
 *   node scripts/sentry-properties.js <파일>   다른 env 파일에서 읽기
 *
 * 읽는 값: SENTRY_AUTH_TOKEN (필수, org:ci 권한이면 충분), SENTRY_ORG, SENTRY_PROJECT, SENTRY_URL
 * 이미 셸 환경변수로 있으면 그 값을 먼저 쓴다. 만드는 파일(둘 다 .gitignore):
 *   ios/sentry.properties      — Xcode 빌드 단계(sentry-xcode.sh, sentry-xcode-debug-files.sh)가 읽음
 *   android/sentry.properties  — Gradle(@sentry/react-native sentry.gradle, Sentry Android Gradle Plugin)이 읽음
 * 토큰은 화면에 찍지 않는다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.homedir(), '.pado', 'sentry.env');

const file = {};
if (fs.existsSync(src)) {
  for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) file[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const get = (k, fallback = '') => process.env[k] || file[k] || fallback;

const token = get('SENTRY_AUTH_TOKEN');
if (!token) {
  console.error(`[sentry:props] SENTRY_AUTH_TOKEN이 없어요 (${src} 또는 환경변수). 릴리스 빌드는 업로드 없이 경고만 내고 계속돼요.`);
  process.exit(1);
}
const props = [
  `defaults.url=${get('SENTRY_URL', 'https://de.sentry.io/')}`,
  `defaults.org=${get('SENTRY_ORG', 'busansoftwaremeisterhighschool')}`,
  `defaults.project=${get('SENTRY_PROJECT', 'react-native')}`,
  `auth.token=${token}`,
  '',
].join('\n');

for (const dir of ['ios', 'android']) {
  const out = path.join(root, dir, 'sentry.properties');
  fs.writeFileSync(out, props, { mode: 0o600 });
  console.log(`[sentry:props] ${path.relative(root, out)} 작성 (토큰 ${token.length}자)`);
}
