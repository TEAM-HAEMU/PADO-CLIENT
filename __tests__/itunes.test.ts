import { pickForTest as pick } from '@/services/itunes';

const row = (trackName: string, artistName: string, seconds?: number) => ({ trackName, artistName, previewUrl: 'p', trackTimeMillis: seconds ? seconds * 1000 : undefined });

test('영문 제목은 제목·가수가 맞는 곡을 고른다', () => {
  const list = [row('Traffic Light [Piano]', 'Flow Music'), row('Traffic Light', 'LEE Mujin')];
  expect(pick(list, 'Traffic light', 'LEE MU JIN')?.artistName).toBe('LEE Mujin');
});

test('영문 제목이 안 맞으면 엉뚱한 곡을 고르지 않는다', () => {
  expect(pick([row('Hello', 'Adele')], 'Through the Night', 'IU')).toBeNull();
});

test('한글 제목은 영문 표기 결과라도 곡 길이가 맞으면 쓴다', () => {
  expect(pick([row('Nan Chun', 'SE SO NEON', 229)], '난춘', '새소년', true, 229)?.trackName).toBe('Nan Chun');
});

test('한글 제목이라도 길이를 모르거나 안 맞으면 엉뚱한 곡을 틀지 않는다', () => {
  // TestFlight 피드백: 너드커넥션 「좋은 밤 좋은 꿈」(4:25)을 눌렀더니 검색 1순위의 다른 곡이 재생됐다
  const list = [row('꿈을 파는 가게, Vol. 2: 여친 꿈을 샀다', 'Fatdoo', 198)];
  expect(pick(list, '좋은 밤 좋은 꿈', '너드커넥션', true, 265)).toBeNull();
  expect(pick(list, '좋은 밤 좋은 꿈', '너드커넥션', true)).toBeNull();
});

test('제목·가수가 같은 판본이 여럿이면 길이가 맞는 것을 고른다', () => {
  const list = [row('Through the Night', 'IU', 300), row('Through the Night', 'IU', 253)];
  expect(pick(list, 'Through the Night', 'IU', false, 253)?.trackTimeMillis).toBe(253000);
});

test('피처링 가수는 첫 가수로 비교', () => {
  expect(pick([row('Meaning of you', 'IU')], 'Meaning of you', 'IU, Kim Chang-Wan')?.artistName).toBe('IU');
});
