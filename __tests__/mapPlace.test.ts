import { placeKey, placeLevel, placeName, sanitizeRegionsAt } from '@/utils/mapPlace';

const yangsan = sanitizeRegionsAt({
  sido: { code: '48', name: '경상남도' },
  sigungu: { code: '48330', name: '양산시' },
  dong: { code: '4833025300', name: '물금읍' },
});

describe('지도 위 제목 — 화면 가운데 지역 이름', () => {
  it('확대 수준으로 단계를 고른다', () => {
    expect(placeLevel(0.018)).toBe('DONG'); // 지도 처음 화면
    expect(placeLevel(0.3)).toBe('SIGUNGU');
    expect(placeLevel(3)).toBe('SIDO');
  });

  it('단계에 맞는 이름', () => {
    expect(placeName(yangsan, 'DONG')).toBe('물금읍');
    expect(placeName(yangsan, 'SIGUNGU')).toBe('양산시');
    expect(placeName(yangsan, 'SIDO')).toBe('경상남도');
  });

  it('없는 단계는 가까운 단계로, 다 없으면 null', () => {
    const sejong = sanitizeRegionsAt({ sido: { code: '36', name: '세종특별자치시' }, sigungu: null, dong: { code: '3611051000', name: '한솔동' } });
    expect(placeName(sejong, 'SIGUNGU')).toBe('세종특별자치시');
    expect(placeName(sanitizeRegionsAt({ sido: null, sigungu: null, dong: null }), 'DONG')).toBeNull();
  });

  it('모양이 이상한 응답은 버린다', () => {
    expect(sanitizeRegionsAt(null)).toEqual({ sido: null, sigungu: null, dong: null });
    expect(sanitizeRegionsAt({ dong: { code: 1, name: '' } }).dong).toBeNull();
  });

  it('가까운 가운데 지점은 같은 요청으로 묶고, 단계가 다르면 따로', () => {
    expect(placeKey(35.3201, 129.0101, 'DONG')).toBe(placeKey(35.3204, 129.0104, 'DONG'));
    expect(placeKey(35.32, 129.01, 'DONG')).not.toBe(placeKey(35.32, 129.01, 'SIGUNGU'));
  });
});
