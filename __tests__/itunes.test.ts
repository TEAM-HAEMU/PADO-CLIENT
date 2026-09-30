import { pickForTest as pick } from '@/services/itunes';

const row = (trackName: string, artistName: string) => ({ trackName, artistName, previewUrl: 'p' });

test('영문 제목은 제목·가수가 맞는 곡을 고른다', () => {
  const list = [row('Traffic Light [Piano]', 'Flow Music'), row('Traffic Light', 'LEE Mujin')];
  expect(pick(list, 'Traffic light', 'LEE MU JIN')?.artistName).toBe('LEE Mujin');
});

test('영문 제목이 안 맞으면 엉뚱한 곡을 고르지 않는다', () => {
  expect(pick([row('Hello', 'Adele')], 'Through the Night', 'IU')).toBeNull();
});

test('한글 제목은 음역된 1순위 결과를 믿는다', () => {
  expect(pick([row('Nan Chun', 'SE SO NEON')], '난춘', '새소년')?.trackName).toBe('Nan Chun');
});

test('피처링 가수는 첫 가수로 비교', () => {
  expect(pick([row('Meaning of you', 'IU')], 'Meaning of you', 'IU, Kim Chang-Wan')?.artistName).toBe('IU');
});
