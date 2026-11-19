/**
 * 프로필 '내 드랍 지도' (QA R-12) — 지도 SDK는 그림을 찍을 때만 띄우고, 찍은 뒤·화면이 가려지면 내린다.
 * 지도(MapView)는 ref 메서드(getMapBoundaries·takeSnapshot)만 가진 가짜로 바꿔 마운트 여부와 호출 수를 센다.
 */
import './setup/screenEnv';

const mockMap = { mounts: 0, unmounts: 0, snapshots: 0, bounds: { northEast: { latitude: 35.2, longitude: 128.92 }, southWest: { latitude: 35.18, longitude: 128.88 } } };
jest.mock('react-native-maps', () => {
  const R = jest.requireActual('react') as typeof import('react');
  class MockMapView extends R.Component<Record<string, unknown>> {
    componentDidMount() { mockMap.mounts++; }
    componentWillUnmount() { mockMap.unmounts++; }
    getMapBoundaries() { return Promise.resolve(mockMap.bounds); }
    takeSnapshot() { mockMap.snapshots++; return Promise.resolve(`SHOT${mockMap.snapshots}`); }
    // eslint-disable-next-line dot-notation
    render() { return R['createElement']('MapView', this.props); }
  }
  return { __esModule: true, default: MockMapView, PROVIDER_DEFAULT: undefined, PROVIDER_GOOGLE: 'google' };
});
jest.mock('@/components/map/DropPin', () => ({ MarkerArt: require('./setup/screenEnv').mockHost('MarkerArt') }));
jest.mock('@/config', () => ({ env: { googleMapsKey: 'k' } }));

import { ProfileDropMap, _resetProfileMapShots, projectPoint } from '@/components/me/ProfileDropMap';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Renderer = import('react-test-renderer').ReactTestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const REGION = { latitude: 35.19, longitude: 128.9, latitudeDelta: 0.02, longitudeDelta: 0.04 };
const PINS = [
  { id: 'new', latitude: 35.19, longitude: 128.9, art: 'https://img/a' },
  { id: 'old', latitude: 35.185, longitude: 128.89, art: 'https://img/b' },
];
const props = (over: Record<string, unknown> = {}) => ({ region: REGION, regionKey: 'r1', pins: PINS, width: 300, height: 120, active: true, ...over });
const el = (over?: Record<string, unknown>) => React.createElement(ProfileDropMap, props(over) as never);
const hosts = (r: Renderer, type: string) => r.root.findAll((n: Node) => (n.type as unknown) === type);
const mapOf = (r: Renderer) => hosts(r, 'MapView')[0];
const { Image } = require('react-native') as typeof import('react-native');
const images = (r: Renderer) => r.root.findAllByType(Image).filter((n: Node) => String(n.props.source?.uri).startsWith('data:image/jpeg'));

let r: Renderer | undefined;
beforeEach(() => { jest.useFakeTimers(); _resetProfileMapShots(); Object.assign(mockMap, { mounts: 0, unmounts: 0, snapshots: 0 }); });
afterEach(() => { act(() => { r?.unmount(); }); r = undefined; jest.useRealTimers(); });

/** 타일이 다 그려졌다는 신호 → 찍기 → 그림 로드 */
async function loadAndCapture(rr: Renderer) {
  act(() => { mapOf(rr).props.onMapLoaded(); });
  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => {});
}

test('웹 메르카토르 투영 — 가장자리는 칸 끝, 경도는 선형, 위도는 메르카토르', () => {
  const b = mockMap.bounds;
  expect(projectPoint(b, 300, 120, b.northEast.latitude, b.southWest.longitude)).toEqual({ x: 0, y: 0 });
  const se = projectPoint(b, 300, 120, b.southWest.latitude, b.northEast.longitude);
  expect(se.x).toBeCloseTo(300, 6);
  expect(se.y).toBeCloseTo(120, 6);
  expect(projectPoint(b, 300, 120, 35.19, 128.9).x).toBeCloseTo(150, 6);
  // 위도 가운데는 메르카토르라 칸 가운데보다 살짝 아래 (북쪽이 더 늘어남)
  expect(projectPoint(b, 300, 120, 35.19, 128.9).y).toBeGreaterThan(60);
});

test('처음 보일 때 지도를 띄워 한 번 찍고, 그림이 뜨면 지도를 내린다 — 핀은 그림 위 보통 뷰', async () => {
  act(() => { r = TestRenderer.create(el()); });
  expect(mockMap.mounts).toBe(1);
  expect(hosts(r!, 'MarkerArt')).toHaveLength(0); // 가장자리를 알기 전엔 핀 없음
  await loadAndCapture(r!);
  expect(mockMap.snapshots).toBe(1);
  // 그림이 지도 위에 올라오고, 핀 2개 (최신이 맨 위 = 뒤에 그림)
  expect(images(r!)).toHaveLength(1);
  const arts = hosts(r!, 'MarkerArt').map(n => n.props.images[0]);
  expect(arts).toEqual(['https://img/b', 'https://img/a']);
  expect(mapOf(r!)).toBeDefined(); // 그림이 실제로 뜨기 전까지는 지도를 둔다
  act(() => { images(r!)[0].props.onLoad(); });
  expect(mapOf(r!)).toBeUndefined();
  expect(mockMap.unmounts).toBe(1);
  // 핀 위치 = 바닥 가운데가 좌표 (55×74)
  const pinViews = r!.root.findAll((n: Node) => typeof n.type === 'string' && n.props.style?.position === 'absolute' && n.props.style?.width === 55);
  expect(pinViews).toHaveLength(2);
  const pin = pinViews[1]; // 최신 드랍 (뒤에 그림)
  const p = projectPoint(mockMap.bounds, 300, 120, 35.19, 128.9);
  expect(pin.props.style.left).toBeCloseTo(p.x - 27.5, 6);
  expect(pin.props.style.top).toBeCloseTo(p.y - 74, 6);
});

test('찍어 둔 범위로 다시 마운트되면(탭 전환 등) 지도를 띄우지 않고 그림만', async () => {
  act(() => { r = TestRenderer.create(el()); });
  await loadAndCapture(r!);
  act(() => { r!.unmount(); });
  act(() => { r = TestRenderer.create(el()); });
  expect(mapOf(r!)).toBeUndefined();
  expect(mockMap.mounts).toBe(1);
  expect(images(r!)).toHaveLength(1);
  expect(hosts(r!, 'MarkerArt')).toHaveLength(2);
});

test('범위 안 핀 그림만 바뀌면(플리 커버 도착) 다시 찍지 않는다', async () => {
  act(() => { r = TestRenderer.create(el()); });
  await loadAndCapture(r!);
  act(() => { images(r!)[0].props.onLoad(); });
  act(() => { r!.update(el({ pins: [{ ...PINS[0], art: 'c1\nc2\nc3\nc4' }, PINS[1]] })); });
  expect(mapOf(r!)).toBeUndefined();
  expect(mockMap.snapshots).toBe(1);
  expect(hosts(r!, 'MarkerArt').map(n => n.props.images.length)).toEqual([1, 4]);
});

test('범위가 바뀌면(드랍 추가·삭제) 보일 때 한 번 다시 찍는다', async () => {
  act(() => { r = TestRenderer.create(el()); });
  await loadAndCapture(r!);
  act(() => { images(r!)[0].props.onLoad(); });
  act(() => { r!.update(el({ regionKey: 'r2' })); });
  expect(mapOf(r!)).toBeDefined();
  await loadAndCapture(r!);
  expect(mockMap.snapshots).toBe(2);
});

test('찍기 전에 화면이 가려지면(다른 탭) 지도를 내리고, 다시 보일 때 찍는다', async () => {
  act(() => { r = TestRenderer.create(el()); });
  expect(mockMap.mounts).toBe(1);
  act(() => { r!.update(el({ active: false })); });
  expect(mapOf(r!)).toBeUndefined();
  expect(mockMap.unmounts).toBe(1);
  // 가려진 동안 지난 타이머가 찍지 않는다
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(mockMap.snapshots).toBe(0);
  act(() => { r!.update(el({ active: true })); });
  expect(mockMap.mounts).toBe(2);
  await loadAndCapture(r!);
  expect(mockMap.snapshots).toBe(1);
});

test('타일 완료 신호가 없어도(Apple 지도 등) 지도 준비 5초 뒤 찍는다', async () => {
  act(() => { r = TestRenderer.create(el()); });
  act(() => { mapOf(r!).props.onMapReady(); });
  await act(async () => { jest.advanceTimersByTime(4900); });
  expect(mockMap.snapshots).toBe(0);
  await act(async () => { jest.advanceTimersByTime(400); });
  await act(async () => {});
  expect(mockMap.snapshots).toBe(1);
});
