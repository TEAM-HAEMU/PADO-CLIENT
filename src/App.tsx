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
import { colors } from '@/theme/tokens';

const theme = { ...DefaultTheme, dark: false, colors: { ...DefaultTheme.colors, background: colors.page, card: colors.card, text: colors.ink, border: colors.line, primary: colors.primary } };

// NativeWind(css-interop)가 로드 시 RN 0.87에서 deprecated된 ImageBackground를 건드려 뜨는 경고 — 앱 코드와 무관
LogBox.ignoreLogs(['ImageBackground is deprecated']);

export default function App() {
  const bootstrap = useAuth(s => s.bootstrap);
  useEffect(() => {
    // 분석 모드(기본 익명·상세·끔)를 먼저 적용해 자동 로그인(bootstrap)의 사용자 식별(상세일 때만)이 기록되게 한다
    startAppStateTracking();
    setAnalyticsMode(usePrefs.getState().analyticsMode)
      .then(() => trackAppOpened())
      .catch(() => {})
      .finally(() => bootstrap());
  }, [bootstrap]);
  const onNavState = () => { const r = navigationRef.getCurrentRoute(); trackScreen(r?.name, r?.params as object | undefined, r?.key); };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.page }} {...touchTracker}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardInset>
            <NavigationContainer ref={navigationRef} theme={theme} linking={linking} fallback={<Splash />} onReady={onNavState} onStateChange={onNavState}>
              <StatusBar barStyle="dark-content" />
              <RootNavigator />
            </NavigationContainer>
          </KeyboardInset>
          <PreviewHost />
          <MiniDisc />
          <DialogHost />
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

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
