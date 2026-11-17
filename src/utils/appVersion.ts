/**
 * 앱 버전 안내 판정 (순수 함수) — 서버 GET /settings/app-version이 플랫폼별 기준을 주고, 비교는 앱이 한다.
 *  - 지금 버전 < minVersion → 필수 (업데이트해야 쓸 수 있음)
 *  - 지금 버전 < latestVersion → 선택 (안내만, '나중에'를 누르면 같은 latestVersion은 다시 안 띄움)
 * 버전은 점으로 나눈 숫자로 비교한다 (1.0.10 > 1.0.9, 1.0 = 1.0.0). 형식이 이상한 값은 없는 것으로 본다 → 안내 안 함
 */
export type AppPlatform = 'IOS' | 'ANDROID';
export interface AppVersionSetting { platform: AppPlatform; minVersion: string; latestVersion: string }
export type UpdateKind = 'required' | 'optional';
export interface UpdateDecision { kind: UpdateKind; latestVersion: string }

const MAX_PARTS = 4;

/** '1.0.25' → [1, 0, 25]. 숫자·점 말고 다른 글자가 있거나 너무 길면 null */
export function parseVersion(v: unknown): number[] | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^\d{1,6}(\.\d{1,6}){0,3}$/.test(s)) return null;
  const parts = s.split('.').map(Number);
  return parts.length <= MAX_PARTS ? parts : null;
}

/** a가 크면 양수, 같으면 0, 작으면 음수. 둘 중 하나라도 형식이 이상하면 null */
export function compareVersions(a: unknown, b: unknown): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** 이 플랫폼 기준으로 안내할지. 응답 모양이 이상하거나 기준이 없거나 지금 버전을 모르면 null */
export function decideUpdate(current: string, settings: unknown, platform: AppPlatform): UpdateDecision | null {
  if (!Array.isArray(settings)) return null;
  const s = (settings as Partial<AppVersionSetting>[]).find(x => !!x && typeof x === 'object' && x.platform === platform);
  if (!s || !parseVersion(current)) return null;
  const belowMin = compareVersions(current, s.minVersion);
  const belowLatest = compareVersions(current, s.latestVersion);
  // 필수일 때도 안내할 버전은 latestVersion (형식이 이상하면 minVersion)
  if (belowMin !== null && belowMin < 0) {
    const latestOk = (compareVersions(s.latestVersion, s.minVersion) ?? -1) >= 0;
    return { kind: 'required', latestVersion: String(latestOk ? s.latestVersion : s.minVersion).trim() };
  }
  if (belowLatest !== null && belowLatest < 0) return { kind: 'optional', latestVersion: String(s.latestVersion).trim() };
  return null;
}

/** 선택 안내를 지금 띄울지 — '나중에'를 누른 latestVersion이면 다시 안 띄운다 (필수는 항상) */
export function shouldPrompt(decision: UpdateDecision | null, dismissedVersion: string | null | undefined): boolean {
  if (!decision) return false;
  if (decision.kind === 'required') return true;
  return dismissedVersion == null || compareVersions(decision.latestVersion, dismissedVersion) !== 0;
}
