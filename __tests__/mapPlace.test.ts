import { PLACE_DELTA, placeKey, placeLevel, placeName, sanitizeRegionsAt, wantsPlace } from '@/utils/mapPlace';

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
    expect(sanitizeRegionsAt(null)).toEqual({ sido: null, sigungu: null, dong: null, place: null });
    expect(sanitizeRegionsAt({ dong: { code: 1, name: '' } }).dong).toBeNull();
  });

  it('가까운 가운데 지점은 같은 요청으로 묶고, 단계가 다르면 따로', () => {
    expect(placeKey(35.3201, 129.0101, 'DONG')).toBe(placeKey(35.3204, 129.0104, 'DONG'));
    expect(placeKey(35.32, 129.01, 'DONG')).not.toBe(placeKey(35.32, 129.01, 'SIGUNGU'));
  });

  it('동보다 더 당기면 장소 단계 — 그때만 장소를 묻는다', () => {
    expect(placeLevel(0.018)).toBe('DONG');
    expect(placeLevel(PLACE_DELTA)).toBe('DONG');
    expect(placeLevel(0.007)).toBe('PLACE');
    expect(placeLevel(0.002)).toBe('PLACE');
    expect(wantsPlace('PLACE')).toBe(true);
    expect(wantsPlace('DONG')).toBe(false);
    expect(wantsPlace('SIDO')).toBe(false);
  });

  it('장소 단계: 장소가 있으면 장소명, 없으면 동 이름', () => {
    const school = sanitizeRegionsAt({
      sido: { code: '26', name: '부산광역시' },
      sigungu: { code: '26440', name: '강서구' },
      dong: { code: '2644056000', name: '대저2동' },
      place: { name: ' 부산소프트웨어마이스터고등학교 ', category: 'SC4' },
    });
    expect(school.place).toEqual({ name: '부산소프트웨어마이스터고등학교', category: 'SC4' });
    expect(placeName(school, 'PLACE')).toBe('부산소프트웨어마이스터고등학교');
    expect(placeName(school, 'DONG')).toBe('대저2동'); // 동 단계에선 장소를 쓰지 않는다
    expect(placeName({ ...school, place: null }, 'PLACE')).toBe('대저2동');
    expect(placeName(yangsan, 'PLACE')).toBe('물금읍'); // 예전 서버 — place 필드 없음
  });

  it('장소 모양이 이상하면 버린다 (분류는 없어도 된다)', () => {
    expect(sanitizeRegionsAt({ place: null }).place).toBeNull();
    expect(sanitizeRegionsAt({ place: { name: '  ' } }).place).toBeNull();
    expect(sanitizeRegionsAt({ place: { name: 3, category: 'SW8' } }).place).toBeNull();
    expect(sanitizeRegionsAt({ place: '서면역' }).place).toBeNull();
    expect(sanitizeRegionsAt({ place: { name: '서면역', category: 7 } }).place).toEqual({ name: '서면역', category: null });
  });

  it('장소 단계는 동 단계와 따로, 더 잘게(약 50m) 묶는다', () => {
    expect(placeKey(35.32, 129.01, 'PLACE')).not.toBe(placeKey(35.32, 129.01, 'DONG'));
    expect(placeKey(35.3201, 129.0101, 'PLACE')).toBe(placeKey(35.3202, 129.0102, 'PLACE'));
    // 동 단계에선 같은 칸이어도 장소 단계에선 100m쯤 떨어지면 다른 칸
    expect(placeKey(35.3201, 129.0101, 'DONG')).toBe(placeKey(35.3209, 129.0101, 'DONG'));
    expect(placeKey(35.3201, 129.0101, 'PLACE')).not.toBe(placeKey(35.3209, 129.0101, 'PLACE'));
  });
});
