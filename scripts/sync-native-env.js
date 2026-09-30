/**
 * .env → 네이티브 설정 동기화.
 *
 * 카카오/Google 로그인과 Google Maps는 네이티브 설정(Info.plist, strings.xml)에
 * 키가 들어가야 동작한다. 키를 코드에 커밋하지 않도록 .env에서 읽어 채운다.
 *   npm run env:sync   (npm run ios 전에 자동 실행)
 *   node scripts/sync-native-env.js <env 파일>   다른 파일에서 읽기 (예: 빈 파일 → 커밋용 'unset' 값)
 * iOS(plutil)는 macOS에서만 — CI(Linux)에서는 Android만 채운다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const kakao = env.KAKAO_NATIVE_APP_KEY || '';
const gmaps = env.GOOGLE_MAPS_API_KEY || '';
const gmapsAndroid = env.GOOGLE_MAPS_ANDROID_API_KEY || gmaps;
const gIos = env.GOOGLE_IOS_CLIENT_ID || '';
// com.googleusercontent.apps.<id> (iOS 클라이언트 ID를 뒤집은 값)
const gScheme = gIos ? gIos.split('.').reverse().join('.') : 'google-unset';

// ── iOS Info.plist (plutil로 안전하게 수정, macOS에서만)
if (process.platform === 'darwin') {
  const plist = path.join(root, 'ios/PADO/Info.plist');
  const pl = (...args) => execFileSync('plutil', [...args, plist]);
  pl('-replace', 'KAKAO_APP_KEY', '-string', kakao);
  pl('-replace', 'GMSApiKey', '-string', gmaps);
  pl('-replace', 'GIDClientID', '-string', gIos);
  const schemes = (i, v) => pl('-replace', `CFBundleURLTypes.${i}.CFBundleURLSchemes`, '-json', JSON.stringify([v]));
  schemes(0, kakao ? `kakao${kakao}` : 'kakao-unset');
  schemes(1, gScheme);
}

// ── Android strings.xml
const strings = path.join(root, 'android/app/src/main/res/values/strings.xml');
if (fs.existsSync(strings)) {
  let xml = fs.readFileSync(strings, 'utf8');
  const put = (name, value) => {
    const tag = `<string name="${name}" translatable="false">${value}</string>`;
    const re = new RegExp(`<string name="${name}"[^>]*>[^<]*</string>`);
    xml = re.test(xml) ? xml.replace(re, tag) : xml.replace('</resources>', `    ${tag}\n</resources>`);
  };
  put('kakao_app_key', kakao || 'unset');
  put('google_maps_api_key', gmapsAndroid || 'unset');
  fs.writeFileSync(strings, xml);
}

const mask = (v) => (v ? `set (${v.length}자)` : '비어 있음');
console.log('[env:sync] Kakao', mask(kakao), '· Google Maps iOS', mask(gmaps), '· Android', mask(gmapsAndroid), '· Google iOS client', mask(gIos));
