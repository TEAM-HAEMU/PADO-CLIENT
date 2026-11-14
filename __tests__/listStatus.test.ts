/* 목록 칸의 불러오는 중·오류·빈 상태 구분 (프로필·플리 탭) */
import './setup/screenEnv';
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({}) }));

import { listStatus } from '@/components/ui/ScreenState';

const q = (over: Partial<Parameters<typeof listStatus>[0]>) => ({ data: undefined, isFetching: false, isError: false, error: null, refetch: jest.fn(), ...over });
const ui = require('@/components/ui');
const typeName = (el: React.ReactElement | null) => (el ? (['Loading', 'Empty'].find(k => ui[k] === el.type) ?? '?') : null);

type Errored = React.ReactElement<{ title: string; action: React.ReactElement<{ label: string; onPress: () => void }> }>;

test('받은 데이터가 있으면 null — 목록(비었으면 빈 상태)을 그대로 그린다', () => {
  expect(listStatus(q({ data: [] }))).toBeNull();
  expect(listStatus(q({ data: [], isError: true, isFetching: true }))).toBeNull();
});

test('처음 불러오는 중이면 로딩 (빈 상태가 아님)', () => {
  expect(typeName(listStatus(q({ isFetching: true })))).toBe('Loading');
});

test('실패하면 오류 + 다시 시도', () => {
  const el = listStatus(q({ isError: true, error: new Error('x') }), '드랍 기록을 불러오지 못했어요') as Errored;
  expect(el.props.title).toBe('드랍 기록을 불러오지 못했어요');
  expect(el.props.action.props.label).toBe('다시 시도');
});

test('다시 시도를 누르면 refetch, 다시 받는 동안은 로딩', () => {
  const query = q({ isError: true, error: new Error('x') });
  const el = listStatus(query) as Errored;
  el.props.action.props.onPress();
  expect(query.refetch).toHaveBeenCalled();
  expect(typeName(listStatus({ ...query, isFetching: true }))).toBe('Loading');
});

test('로그인 전처럼 꺼진 쿼리(받지도 않고 오류도 없음)는 null — 빈 상태', () => {
  expect(listStatus(q({}))).toBeNull();
});
