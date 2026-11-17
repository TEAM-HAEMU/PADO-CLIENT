/**
 * 목 응답 — 목 서버(mock/server)에 아직 없는 두 경로 (USE_MOCK=true일 때 endpoints가 직접 부른다).
 *  - GET /droppings/recent-album-images → 목 커버 9장
 *  - GET /settings/app-version → 개발용 플래그로 필수·선택 안내를 골라 본다 (기본: 안내 없음)
 *      iOS: 실행 인자 `-PADO_MOCK_UPDATE required|optional` (다시 빌드할 필요 없음)
 *      공통: .env `MOCK_APP_UPDATE=required|optional` (react-native-config, 다시 빌드)
 */
import { Platform, Settings } from 'react-native';
import Config from 'react-native-config';
import { getVersion } from 'react-native-device-info';
import { parseVersion, type AppVersionSetting } from '@/utils/appVersion';
import { MOCK_COVERS } from './covers';

const latency = () => new Promise<void>(r => setTimeout(r, 180 + Math.random() * 220));

export type MockUpdateFlag = 'required' | 'optional' | 'none';

export function mockUpdateFlag(): MockUpdateFlag {
  const arg = Platform.OS === 'ios' ? Settings.get('PADO_MOCK_UPDATE') : undefined;
  const v = String(arg || Config.MOCK_APP_UPDATE || '').toLowerCase();
  return v === 'required' || v === 'optional' ? v : 'none';
}

/** 지금 버전보다 한 단계 높은 버전 (1.0 → 1.1, 1.0.25 → 1.0.26) */
export function nextVersion(current: string): string {
  const p = parseVersion(current) ?? [1, 0];
  p[p.length - 1] += 1;
  return p.join('.');
}

/** 플래그에 맞춘 기준 — 필수: min·latest 모두 다음 버전 / 선택: latest만 / 없음: "0" */
export function mockVersionSettings(current: string, flag: MockUpdateFlag): AppVersionSetting[] {
  const next = nextVersion(current);
  const min = flag === 'required' ? next : '0';
  const latest = flag === 'none' ? '0' : next;
  return (['IOS', 'ANDROID'] as const).map(platform => ({ platform, minVersion: min, latestVersion: latest }));
}

export async function appVersion(): Promise<AppVersionSetting[]> {
  await latency();
  return mockVersionSettings(getVersion(), mockUpdateFlag());
}

export async function recentAlbumImages(): Promise<string[]> {
  await latency();
  return MOCK_COVERS.slice(0, 9);
}
