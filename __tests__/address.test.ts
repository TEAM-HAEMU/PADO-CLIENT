import { dropPlace, formatAddress } from '@/utils/address';

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

describe('드랍 자리 표시 — 장소 이름 먼저, 없으면 주소', () => {
  it('placeName이 있으면 장소 이름', () => {
    expect(dropPlace({ placeName: '스타벅스 해운대점', address: '부산광역시 해운대구 우동 1408' })).toBe('스타벅스 해운대점');
  });

  it('placeName이 없거나 비었거나 null이면 지금처럼 주소 (예전 서버·못 찾은 드랍)', () => {
    expect(dropPlace({ address: '부산광역시 해운대구 우동 1408' })).toBe('부산광역시 해운대구 우동 1408');
    expect(dropPlace({ placeName: null, address: '우동' })).toBe('우동');
    expect(dropPlace({ placeName: '  ', address: '우동' })).toBe('우동');
    expect(dropPlace({ placeName: 'null', address: '우동' })).toBe('우동');
  });

  it('둘 다 없으면 빈 문자열', () => {
    expect(dropPlace({})).toBe('');
    expect(dropPlace(null, undefined)).toBe('');
  });

  it('여러 출처면 어느 출처의 장소 이름이든 주소보다 먼저, 같은 종류끼리는 앞 출처가 먼저', () => {
    // 음악 상세엔 둘 다 없고 주변 목록에만 있는 경우
    expect(dropPlace({}, { placeName: '서면역', address: '부산진구 부전동' })).toBe('서면역');
    // 상세엔 주소만, 목록엔 장소 이름
    expect(dropPlace({ address: '부전동' }, { placeName: '서면역' })).toBe('서면역');
    expect(dropPlace({ address: '부전동' }, { address: '다른 주소' })).toBe('부전동');
    expect(dropPlace({ placeName: '상세 장소' }, { placeName: '목록 장소' })).toBe('상세 장소');
  });
});
