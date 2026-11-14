import { createScreenTimer, type ScreenLeft } from '@/services/screenTimer';

function setup() {
  let t = 0;
  const out: ScreenLeft[] = [];
  const timer = createScreenTimer(() => t, e => out.push(e));
  return { timer, out, at: (v: number) => { t = v; } };
}

test('화면을 옮기면 앞 화면에 머문 시간을 알린다', () => {
  const { timer, out, at } = setup();
  expect(timer.enter('Map', 'm')).toBe(true);
  at(1500);
  expect(timer.enter('Player', 'p')).toBe(true);
  expect(out).toEqual([{ screen: 'Map', duration_ms: 1500, reason: 'navigate' }]);
});

test('같은 route key면 새 화면으로 보지 않고, 같은 이름이라도 key가 다르면 새 화면', () => {
  const { timer, out, at } = setup();
  timer.enter('Player', 'p1');
  at(100);
  expect(timer.enter('Player', 'p1')).toBe(false);
  at(300);
  expect(timer.enter('Player', 'p2')).toBe(true);
  expect(out).toEqual([{ screen: 'Player', duration_ms: 300, reason: 'navigate' }]);
});

test('백그라운드 동안은 세지 않고, 앞으로 오면 0부터 다시', () => {
  const { timer, out, at } = setup();
  timer.enter('Map');
  at(2000);
  timer.background();
  timer.background(); // 두 번 와도 한 번만
  at(60_000);
  timer.foreground();
  at(61_000);
  timer.enter('Settings');
  expect(out).toEqual([
    { screen: 'Map', duration_ms: 2000, reason: 'background' },
    { screen: 'Map', duration_ms: 1000, reason: 'navigate' },
  ]);
});

test('백그라운드에서 화면이 바뀌면(알림 탭 등) 앞 화면은 다시 알리지 않는다', () => {
  const { timer, out, at } = setup();
  timer.enter('Map');
  at(500);
  timer.background();
  at(9000);
  timer.enter('PinPreview');
  at(9400);
  timer.background();
  expect(out).toEqual([
    { screen: 'Map', duration_ms: 500, reason: 'background' },
    { screen: 'PinPreview', duration_ms: 400, reason: 'background' },
  ]);
});
