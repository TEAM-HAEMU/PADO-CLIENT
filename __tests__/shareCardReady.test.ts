/**
 * 공유 카드 캡처 대기 (2026-11-20 QA R-08) — 이미 고른 스타일을 다시 눌러도 카드가 준비된 상태로 남아 곧바로 찍는지.
 * 예전에는 누를 때 준비 표시를 끄는데 카드는 다시 마운트되지 않아(key가 같음) 준비 신호가 다시 오지 않았다 → 공유가 매번 3초 기다림.
 */
import './setup/screenEnv';

jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
// 카드는 마운트될 때 한 번만 준비를 알린다 (실제 StoryCard처럼 — 앨범 아트 onLoad 또는 아트 없음)
jest.mock('@/components/share/StoryCard', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    CARD_EDGE: { C: ['#fff', '#fff'], E: ['#fff', '#fff'], H: ['#fff', '#fff'] },
    StoryCard: (p: { onReady?: () => void }) => {
      const sent = R.useRef(false);
      R.useEffect(() => { if (!sent.current) { sent.current = true; p.onReady?.(); } });
      return R.createElement('StoryCard', p);
    },
  };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///tmp/pado-drop.png') }));
jest.mock('react-native-share', () => ({ __esModule: true, default: { open: jest.fn(async () => ({})), shareSingle: jest.fn(async () => ({})), isPackageInstalled: jest.fn(async () => ({ isInstalled: false })) }, Social: { InstagramStories: 'instagramstories' } }));
jest.mock('@/config', () => ({ FB_APP_ID: 'test' }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { captureRef } from 'react-native-view-shot';
import Share from 'react-native-share';
import ShareCardScreen from '@/screens/drop/ShareCardScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const card = { art: null, title: '난춘', sub: '새소년', place: '부산 강서구', note: '퇴근길' };
const nav = { goBack: jest.fn(), navigate: jest.fn() };

async function mount() {
  let r!: import('react-test-renderer').ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ShareCardScreen as never, { navigation: nav, route: { params: card } })); });
  // 미리보기 카드 크기를 정하는 onLayout
  const box = r.root.findAll(n => typeof n.props.onLayout === 'function')[0];
  await act(async () => box.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } }));
  return r;
}
const styleButton = (r: import('react-test-renderer').ReactTestRenderer, label: string) => r.root.find(n => (n.type as unknown) === 'Press' && n.props.accessibilityLabel === label);
const sendOther = (r: import('react-test-renderer').ReactTestRenderer) => r.root.find(n => (n.type as unknown) === 'SecondaryButton').props.onPress();

beforeEach(() => { jest.useFakeTimers(); (captureRef as jest.Mock).mockClear(); (Share.open as jest.Mock).mockClear(); });
afterEach(() => jest.useRealTimers());

it('이미 고른 스타일을 다시 눌러도 곧바로 찍는다 (3초 기다리지 않음)', async () => {
  const r = await mount();
  await act(async () => styleButton(r, '지도 위 핀').props.onPress());
  await act(async () => { sendOther(r); });
  await act(async () => { jest.advanceTimersByTime(50); });
  expect(captureRef).toHaveBeenCalledTimes(1);
  expect(Share.open).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('다른 스타일로 바꾸면 그 카드가 준비된 뒤에 찍는다', async () => {
  const r = await mount();
  await act(async () => styleButton(r, '물 위에 뜬 노래').props.onPress());
  await act(async () => { sendOther(r); });
  await act(async () => { jest.advanceTimersByTime(50); });
  expect(captureRef).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});
