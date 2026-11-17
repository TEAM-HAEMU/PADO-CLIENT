/* 드랍 종류 화면 예시 그림 9자리 채우기 (utils/albumSlots) */
import { albumSlots, ART_SLOTS, SLOT } from '@/utils/albumSlots';

const url = (i: number) => `https://i.scdn.co/image/ab67616d0000b273${i}`;

describe('albumSlots', () => {
  it('받은 순서대로 9자리를 채운다', () => {
    const urls = Array.from({ length: 9 }, (_, i) => url(i));
    expect(albumSlots(urls)).toEqual(urls);
  });
  it('9개보다 많으면 앞의 9개만', () => {
    const urls = Array.from({ length: 12 }, (_, i) => url(i));
    expect(albumSlots(urls)).toEqual(urls.slice(0, 9));
  });
  it('모자라면 남은 자리는 null (예시 그림 그대로)', () => {
    expect(albumSlots([url(0), url(1)])).toEqual([url(0), url(1), null, null, null, null, null, null, null]);
  });
  it('받기 전·실패·이상한 응답이면 모두 null', () => {
    for (const bad of [undefined, null, {}, 'x', [], [1, null, {}]]) {
      expect(albumSlots(bad)).toEqual(Array(ART_SLOTS).fill(null));
    }
  });
  it('중복·https가 아닌 주소는 건너뛰고 다음 것으로 채운다', () => {
    expect(albumSlots([url(0), url(0), 'http://x/a.jpg', 'javascript:alert(1)', '', url(1)]).slice(0, 3)).toEqual([url(0), url(1), null]);
  });
  it('목 모드 data:image 주소는 쓴다', () => {
    expect(albumSlots(['data:image/jpeg;base64,AAA'])[0]).toBe('data:image/jpeg;base64,AAA');
  });
  it('자리 번호는 0~8을 한 번씩 쓴다', () => {
    const all = [SLOT.music, ...SLOT.vote, ...SLOT.playlistTiles, SLOT.playlistBack].sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
