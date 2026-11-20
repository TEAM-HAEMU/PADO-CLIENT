/**
 * Android 15+ 글자 잘림 (QA 2026-11-20 Z-03) — 프로필 편집 '저장'이 '저', 240dpi 프로필 '드랍'이 '드'로 보이던 것.
 * targetSdk 35 이상이면 TextView가 글자 잉크 경계로 줄 폭을 재는데(USE_BOUNDS_FOR_WIDTH), React Native는 advance 기준으로 재서
 * 자간이 있는 짧은 라벨의 마지막 글자가 다음 줄로 넘어가 잘린다. 앱 테마의 textViewStyle에서 이 동작을 끈다.
 * AppTheme은 values와 values-v27에 따로 있어서, 한쪽만 고치면 Android 8.1+ 기기에서 다시 생긴다.
 */
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다)
const fs = require('fs') as { readFileSync: (p: string, enc: 'utf8') => string; readdirSync: (p: string) => string[]; existsSync: (p: string) => boolean };
const path = require('path') as { resolve: (...p: string[]) => string; join: (...p: string[]) => string };

export {};

const RES = 'android/app/src/main/res';
const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');
/** AppTheme을 정의한 styles.xml 전부 */
const themeFiles = fs.readdirSync(path.resolve(RES))
  .filter(d => d.startsWith('values'))
  .map(d => path.join(RES, d, 'styles.xml'))
  .filter(f => fs.existsSync(path.resolve(f)) && /<style name="AppTheme"/.test(read(f)));

describe('Android 글자 폭 기준 (Z-03)', () => {
  it('AppTheme이 있는 모든 values 폴더에서 textViewStyle을 PadoTextView로 둔다', () => {
    expect(themeFiles.length).toBeGreaterThanOrEqual(2);
    for (const f of themeFiles) {
      const theme = read(f).split('<style name="AppTheme"')[1].split('</style>')[0];
      expect([f, theme.includes('<item name="android:textViewStyle">@style/PadoTextView</item>')]).toEqual([f, true]);
    }
  });

  it('Android 15+(values-v35)에서 PadoTextView는 잉크 경계 대신 advance로 폭을 잰다', () => {
    const v35 = read(`${RES}/values-v35/styles.xml`);
    const style = v35.split('<style name="PadoTextView"')[1].split('</style>')[0];
    expect(style).toContain('<item name="android:useBoundsForWidth">false</item>');
  });

  it('PadoTextView는 AppCompat 기본 TextView 스타일을 그대로 잇는다 (글자 모양은 그대로)', () => {
    for (const f of [`${RES}/values/styles.xml`, `${RES}/values-v35/styles.xml`]) {
      expect(read(f)).toMatch(/<style name="PadoTextView" parent="Widget\.AppCompat\.TextView"/);
    }
  });
});
