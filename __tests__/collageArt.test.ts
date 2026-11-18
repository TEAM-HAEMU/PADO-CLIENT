/* 플리 커버 콜라주 — 4칸이면 칸 크기(≈85pt)에 맞는 300px 판본을 받는다 (640px 원본 4장을 디코딩하지 않게) */
import './setup/screenEnv';

jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());

import { Image } from 'react-native';
import { Collage } from '@/components/music/Collage';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const spotify = (id: string, prefix = 'ab67616d0000b273') => `https://i.scdn.co/image/${prefix}${id}`;
function render(images: (string | null)[], size: number) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Collage, { images, size })); });
  return r;
}

test('4곡 이상이면 칸마다 300px 판본 (플리 상세 170pt · 플리 탭 카드 약 165pt)', () => {
  for (const size of [170, 165]) {
    const r = render(['a', 'b', 'c', 'd', 'e'].map(id => spotify(id)), size);
    expect(r.root.findAllByType(Image).map(n => n.props.source.uri)).toEqual(['a', 'b', 'c', 'd'].map(id => spotify(id, 'ab67616d00001e02')));
  }
});

test('작은 콜라주(60pt — 칸 30pt)는 64px 판본, Spotify가 아닌 주소는 그대로', () => {
  const r = render([spotify('a'), 'https://img.test/b.jpg', spotify('c'), spotify('d')], 60);
  expect(r.root.findAllByType(Image).map(n => n.props.source.uri)).toEqual([spotify('a', 'ab67616d00004851'), 'https://img.test/b.jpg', spotify('c', 'ab67616d00004851'), spotify('d', 'ab67616d00004851')]);
});

test('4곡 미만이면 첫 곡 아트 하나 (Art가 크기를 맞춘다 — 전과 같음)', () => {
  const r = render([spotify('a'), null, spotify('b')], 170);
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(r.root.findAll(n => (n.type as unknown) === 'Art')[0].props.uri).toBe(spotify('a'));
});
