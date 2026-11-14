import { formatAddress } from '@/utils/address';

test('iOS "(null)" 필드와 중복을 걸러낸다', () => {
  expect(formatAddress({ administrativeArea: '부산광역시', subAdministrativeArea: '(null)', locality: '강서구', subLocality: '봉림동', thoroughfare: '(null)', subThoroughfare: '(null)', name: '봉림동' }))
    .toEqual({ dong: '봉림동', full: '부산광역시 강서구 봉림동' });
});

test('동 정보가 없으면 name으로', () => {
  expect(formatAddress({ name: '가락대로 1393', subLocality: '(null)', locality: null })).toEqual({ dong: '가락대로 1393', full: '가락대로 1393' });
});

import { artUrl } from '@/utils/artUrl';

test('artUrl — Spotify 썸네일 크기 선택', () => {
  const u = 'https://i.scdn.co/image/ab67616d0000b27362fa9ca3dea123404eda1b71';
  expect(artUrl(u, 26)).toContain('ab67616d00004851');
  expect(artUrl(u, 56)).toContain('ab67616d00001e02');
  expect(artUrl(u, 232)).toBe(u);
  expect(artUrl('https://is1-ssl.mzstatic.com/x.jpg', 26)).toBe('https://is1-ssl.mzstatic.com/x.jpg');
});

test('분석용 지역은 시·도 + 시·군·구까지만', () => {
  const { regionOf } = require('@/utils/address') as typeof import('@/utils/address');
  expect(regionOf('부산광역시 해운대구 우동 1408')).toBe('부산광역시 해운대구');
  expect(regionOf('경기도 성남시 분당구 정자동 178-1')).toBe('경기도 성남시 분당구');
  expect(regionOf('서울특별시 강남구')).toBe('서울특별시 강남구');
  expect(regionOf('세종특별자치시 한누리대로 2130')).toBe('세종특별자치시');
  expect(regionOf('제주특별자치도 제주시 연동')).toBe('제주특별자치도 제주시');
  expect(regionOf('가락대로 1393')).toBeNull();
  expect(regionOf('')).toBeNull();
  expect(regionOf(null)).toBeNull();
});
