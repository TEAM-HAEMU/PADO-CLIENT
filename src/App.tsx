/**
 * PADO — 거리에 음악을 흘려두고, 누군가의 하루에 닿게.
 * 디자인: Figma PADO · MVP B(Deep) 섹션 / API: /api/v1 명세
 */
import './global.css';
import React, { useEffect } from 'react';
import { StatusBar, LogBox, Platform } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastHost } from '@/components/ui/Toast';
import { DialogHost, touchTracker } from '@/components/ui/Dialog';
import { linking } from '@/navigation/linking';
import { navigationRef } from '@/navigation/ref';
import { queryClient } from '@/hooks/queryClient';
import { RootNavigator, Splash } from '@/navigation/RootNavigator';
import { PreviewHost } from '@/services/preview';
import { MiniDisc } from '@/components/music/MiniDisc';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { setAnalyticsMode, startAppStateTracking, trackAppOpened, trackScreen } from '@/services/analytics';
import { initMonitoring, registerNavigation, reportError, Sentry } from '@/services/monitoring';
import { startPush } from '@/services/push';
import { startPushRegionSync } from '@/services/pushRegion';
import { AppErrorFallback } from '@/components/AppErrorFallback';
import { colors } from '@/theme/tokens';
import { startAppUpdateCheck, useAppUpdate } from '@/services/appUpdate';
import { startRecentAlbumArtPrefetch } from '@/hooks/useRecentAlbumArt';
import UpdateRequiredScreen from '@/screens/update/UpdateRequiredScreen';

const theme = { ...DefaultTheme, dark: false, colors: { ...DefaultTheme.colors, background: colors.page, card: colors.card, text: colors.ink, border: colors.line, primary: colors.primary } };

// NativeWind(css-interop)가 로드 시 RN 0.87에서 deprecated된 ImageBackground를 건드려 뜨는 경고 — 앱 코드와 무관
// Sentry를 켜지 않는 빌드(개발·목 모드·DSN 없음·이용 분석 끔)에서 Sentry.wrap이 앱 시작 추적을 못 끝냈다고 내는 경고 — 의도된 상태.
// 개발 빌드에선 이 경고가 하단 LogBox 띠로 떠서 탭 바를 가린다 (UI 테스트·수동 확인 방해)
LogBox.ignoreLogs(['ImageBackground is deprecated', 'App Start Span could not be finished']);

const renderFallback = ({ resetError }: { resetError: () => void }) => <AppErrorFallback onReset={resetError} />;

// 오류 진단(Sentry)은 첫 렌더 전에 시작해야 앱 시작 시간·초기 오류가 잡힌다 (분석 모드는 저장값으로 이미 정해져 있음)
initMonitoring();

function App() {
  const bootstrap = useAuth(s => s.bootstrap);
  // 앱 버전 확인(시작 때·돌아올 때 1시간 간격)과 드랍 종류 화면 예시 그림용 최근 앨범 이미지 미리 받기
  useEffect(() => { startAppUpdateCheck(); startRecentAlbumArtPrefetch(queryClient); }, []);
  // 필수 업데이트면 내비게이션 대신 업데이트 화면 한 장만 (시트·모달까지 모두 내려서 앱을 쓸 수 없게)
  const updateRequired = useAppUpdate(s => s.decision?.kind === 'required');
  useEffect(() => {
    // 자동 로그인(bootstrap)은 분석 SDK 시작을 기다리지 않는다 — SDK가 늦거나 응답이 없어도 Splash에 머물지 않게.
    // 시작 전에 생긴 이벤트·사용자 식별(상세일 때만)은 분석 모듈이 모아 두었다가 시작하면 보낸다
    startAppStateTracking();
    setAnalyticsMode(usePrefs.getState().analyticsMode)
      .then(() => trackAppOpened())
      .catch(e => reportError(e, 'analytics_start'));
    bootstrap();
    // 푸시 — 로그인 상태를 따라 토큰 등록·알림 설정 받기, 주변 새 드랍용 마지막 동네 알리기
    startPush();
    startPushRegionSync();
  }, [bootstrap]);
  const onNavState = () => { const r = navigationRef.getCurrentRoute(); trackScreen(r?.name, r?.params as object | undefined, r?.key); };
  const onNavReady = () => { registerNavigation(navigationRef); onNavState(); };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.page }} {...touchTracker}>
      <SafeAreaProvider>
        {/* 화면을 그리다 난 오류 → Sentry로 보내고 흰 화면 대신 다시 불러오기 화면 */}
        <Sentry.ErrorBoundary fallback={renderFallback}>
          <QueryClientProvider client={queryClient}>
            <KeyboardInset>
              {updateRequired ? <UpdateRequiredScreen /> : (
                <NavigationContainer ref={navigationRef} theme={theme} linking={linking} fallback={<Splash />} onReady={onNavReady} onStateChange={onNavState}>
                  <StatusBar barStyle="dark-content" />
                  <RootNavigator />
                </NavigationContainer>
              )}
            </KeyboardInset>
            <PreviewHost />
            {updateRequired ? null : <MiniDisc />}
            <DialogHost />
            <ToastHost />
          </QueryClientProvider>
        </Sentry.ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// 터치(직전 동작 기록)·앱 시작 추적 — Sentry가 꺼져 있으면 아무것도 보내지 않는다
export default Sentry.wrap(App);

/**
 * Android 15+ edge-to-edge에선 adjustResize가 창을 줄여 주지 않아 키보드가 입력칸·버튼을 덮는다.
 * 키보드 높이만큼 화면 아래를 비워 예전 adjustResize처럼 줄인다 (iOS는 화면마다 따로 처리하므로 그대로).
 */
function KeyboardInset({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'android') return <>{children}</>;
  return <AndroidKeyboardInset>{children}</AndroidKeyboardInset>;
}

function AndroidKeyboardInset({ children }: { children: React.ReactNode }) {
  const keyboard = useAnimatedKeyboard();
  const inset = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  return <Animated.View style={[{ flex: 1 }, inset]}>{children}</Animated.View>;
}
