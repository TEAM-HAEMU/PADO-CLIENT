import type { DropRadius } from '@/api/types';
import { DEFAULT_RADIUS } from '@/utils/dropScope';
import { readSig, scopeSig, scopeTip } from '@/utils/scopeTip';

const base: DropRadius = DEFAULT_RADIUS; // 거리 5km / 재생 500m
const seenBase = scopeSig(base);

describe('scopeTip — 설정이 바뀌었을 때 지도 안내 문구', () => {
  it('처음(기준 없음)이거나 바뀐 게 없으면 띄우지 않는다', () => {
    expect(scopeTip(null, base)).toBeNull();
    expect(scopeTip(seenBase, { ...base, updatedAt: '2026-11-16T12:00:00.000+09:00' })).toBeNull();
  });

  it('내가 움직여 지역 이름만 바뀐 것은 설정 변경이 아니다', () => {
    const gangnam: DropRadius = { ...base, mode: 'REGION', regionUnit: 'SIGUNGU', displayMeters: null, region: { unit: 'SIGUNGU', code: '11680', name: '서울특별시 강남구' } };
    const seocho: DropRadius = { ...gangnam, region: { unit: 'SIGUNGU', code: '11650', name: '서울특별시 서초구' } };
    expect(scopeTip(scopeSig(gangnam), seocho)).toBeNull();
  });

  it('보기가 같은 지역으로 바뀌면 지금 지역 이름 + 전체 (동 단위는 전체 없이)', () => {
    const r: DropRadius = { ...base, mode: 'REGION', regionUnit: 'SIGUNGU', displayMeters: null, region: { unit: 'SIGUNGU', code: '11680', name: '서울특별시 강남구' } };
    expect(scopeTip(seenBase, r)).toEqual({ title: '이제 강남구 전체 드랍이 보여요', body: null });
    expect(scopeTip(seenBase, { ...r, region: null })?.title).toBe('이제 내가 있는 시·군·구 전체 드랍이 보여요');
    expect(scopeTip(seenBase, { ...r, regionUnit: 'DONG', region: { unit: 'DONG', code: '1168064000', name: '서울특별시 강남구 역삼1동' } })?.title).toBe('이제 역삼1동 드랍이 다 보여요');
  });

  it('보기 반경·전국', () => {
    expect(scopeTip(seenBase, { ...base, displayMeters: 3000 })?.title).toBe('이제 3km 안 드랍이 보여요');
    expect(scopeTip(seenBase, { ...base, displayMeters: null })?.title).toBe('이제 전국 드랍이 보여요');
  });

  it('재생만 같은 지역으로 바뀌면 그게 큰 줄', () => {
    const dong: DropRadius = { ...base, playMode: 'REGION', playRegionUnit: 'DONG', playRegion: { unit: 'DONG', code: '2635052000', name: '부산광역시 해운대구 중동' } };
    expect(scopeTip(seenBase, dong)).toEqual({ title: '중동 안 드랍은 멀어도 들을 수 있어요', body: null });
    expect(scopeTip(seenBase, { ...dong, playRegion: null })?.title).toBe('같은 동 안 드랍은 멀어도 들을 수 있어요');
  });

  it('재생 반경만 바뀌어도 알린다', () => {
    expect(scopeTip(seenBase, { ...base, playMeters: 1000 })?.title).toBe('1km 안에 들어오면 들을 수 있어요');
  });

  it('둘 다 바뀌면 보기가 큰 줄, 재생이 받치는 줄', () => {
    const r: DropRadius = { ...base, mode: 'REGION', regionUnit: 'SIGUNGU', displayMeters: null, region: { unit: 'SIGUNGU', code: '26350', name: '부산광역시 해운대구' }, playMode: 'REGION', playRegionUnit: 'DONG', playRegion: { unit: 'DONG', code: '2635052000', name: '부산광역시 해운대구 중동' } };
    expect(scopeTip(seenBase, r)).toEqual({ title: '이제 해운대구 전체 드랍이 보여요', body: '중동 안 드랍은 멀어도 들을 수 있어요' });
  });

  it('저장해 둔 값 읽기 — 깨진 값은 null', () => {
    expect(readSig(seenBase)).toEqual(seenBase);
    expect(readSig(null)).toBeNull();
    expect(readSig({ mode: 'X' })).toBeNull();
    expect(readSig({ mode: 'DISTANCE', playMode: 'DISTANCE' })).toBeNull();
  });
});
