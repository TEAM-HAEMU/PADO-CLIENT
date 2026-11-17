/* 프로필 동그라미 — 사진 주소가 있으면 사진, 비었거나 못 불러오면 이름 첫 글자 */
import './setup/screenEnv';

jest.mock('react-native-linear-gradient', () => {
  // eslint-disable-next-line dot-notation
  return (p: { children?: unknown }) => jest.requireActual('react')['createElement']('LinearGradient', null, p.children);
});
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));

import { Image, Text } from 'react-native';
import { Avatar } from '@/components/ui';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

type Props = { uri?: string | null; name?: string; size?: number };
function render(props: Props) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Avatar, props)); });
  return r;
}
const images = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAllByType(Image);
const initial = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAllByType(Text).map(t => t.props.children).join('');

test('사진 주소가 있으면 그 사진을 보여 준다', () => {
  const r = render({ uri: 'https://img.test/profile/a.jpg', name: '하윤', size: 24 });
  expect(images(r)).toHaveLength(1);
  expect(images(r)[0].props.source).toEqual({ uri: 'https://img.test/profile/a.jpg' });
  expect(initial(r)).toBe('');
});

test.each([undefined, null, '', '   '])('사진 주소가 %p이면 이름 첫 글자', uri => {
  const r = render({ uri, name: '하윤' });
  expect(images(r)).toHaveLength(0);
  expect(initial(r)).toBe('하');
});

test('사진을 못 불러오면 이름 첫 글자로 바뀌고, 다른 사진 주소가 오면 다시 사진을 시도한다', () => {
  const r = render({ uri: 'https://img.test/profile/broken.jpg', name: '도윤' });
  act(() => { images(r)[0].props.onError({ nativeEvent: { error: 'fail' } }); });
  expect(images(r)).toHaveLength(0);
  expect(initial(r)).toBe('도');

  act(() => { r.update(React.createElement(Avatar, { uri: 'https://img.test/profile/new.jpg', name: '도윤' })); });
  expect(images(r)).toHaveLength(1);
  expect(images(r)[0].props.source).toEqual({ uri: 'https://img.test/profile/new.jpg' });
});

test('이름도 없으면 물음표', () => {
  expect(initial(render({}))).toBe('?');
});
