/* 소셜 로그인 자격 증명 — Apple identity token·authorization code·이름, 취소 처리 */
export {};
jest.mock('@react-native-seoul/kakao-login', () => ({ login: jest.fn() }));
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { configure: jest.fn(), signOut: jest.fn() } }));
jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    isSupported: true,
    performRequest: jest.fn(),
    Operation: { LOGIN: 1 },
    Scope: { EMAIL: 0, FULL_NAME: 1 },
    Error: { CANCELED: '1001' },
  },
}));

type Mod = typeof import('../src/services/socialAuth');
const load = (useMock: boolean) => {
  let mod!: Mod;
  let apple!: { performRequest: jest.Mock };
  jest.isolateModules(() => {
    jest.doMock('../src/config', () => ({ env: { useMock, kakaoAppKey: 'k', google: { webClientId: 'w', iosClientId: 'i' } } }));
    apple = require('@invertase/react-native-apple-authentication').appleAuth;
    mod = require('../src/services/socialAuth');
  });
  return { mod, apple };
};

test('Apple 이름: 한글은 성+이름, 영문은 이름 성, 없으면 undefined', () => {
  const { mod } = load(false);
  expect(mod.appleDisplayName({ familyName: '서', givenName: '정현' } as never)).toBe('서정현');
  expect(mod.appleDisplayName({ familyName: 'Suh', givenName: 'Fabio' } as never)).toBe('Fabio Suh');
  expect(mod.appleDisplayName({ familyName: null, givenName: null } as never)).toBeUndefined();
  expect(mod.appleDisplayName(null)).toBeUndefined();
});

test('Apple 자격 증명 → 백엔드 요청 본문', async () => {
  const { mod, apple } = load(false);
  apple.performRequest.mockResolvedValueOnce({ identityToken: 'id.jwt', authorizationCode: 'code', fullName: { familyName: '서', givenName: '정현' } });
  await expect(mod.getProviderCredential('apple')).resolves.toEqual({ identityToken: 'id.jwt', authorizationCode: 'code', name: '서정현' });
  // 두 번째 로그인부터는 이름이 오지 않음 → name 생략
  apple.performRequest.mockResolvedValueOnce({ identityToken: 'id.jwt', authorizationCode: 'code', fullName: null });
  await expect(mod.getProviderCredential('apple')).resolves.toEqual({ identityToken: 'id.jwt', authorizationCode: 'code' });
});

test('Apple 창을 닫으면 조용히 취소, 토큰이 없으면 오류', async () => {
  const { mod, apple } = load(false);
  apple.performRequest.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: '1001' }));
  await expect(mod.getProviderCredential('apple')).rejects.toBeInstanceOf(mod.SocialCancelled);
  apple.performRequest.mockResolvedValueOnce({ identityToken: null, authorizationCode: 'code' });
  await expect(mod.getProviderCredential('apple')).rejects.toThrow('Apple 로그인 정보를 받지 못했어요');
});

test('목 모드는 SDK 없이 가짜 자격 증명', async () => {
  const { mod, apple } = load(true);
  await expect(mod.getProviderCredential('apple')).resolves.toMatchObject({ identityToken: 'mock-apple-token', authorizationCode: 'mock-apple-code' });
  await expect(mod.getProviderCredential('kakao')).resolves.toEqual({ accessToken: 'mock-kakao-token' });
  expect(apple.performRequest).not.toHaveBeenCalled();
});
