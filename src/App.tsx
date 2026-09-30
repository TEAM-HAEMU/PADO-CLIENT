/**
 * PADO — 거리에 음악을 흘려두고, 누군가의 하루에 닿게.
 * 디자인: Figma PADO · MVP B(Deep) 섹션 / API: /api/v1 명세
 */
import './global.css';
import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastHost } from '@/components/ui/Toast';
import { DialogHost } from '@/components/ui/Dialog';
import { linking } from '@/navigation/linking';
import { navigationRef } from '@/navigation/ref';
import { queryClient } from '@/hooks/queryClient';
import { RootNavigator, Splash } from '@/navigation/RootNavigator';
import { PreviewHost } from '@/services/preview';
import { MiniDisc } from '@/components/music/MiniDisc';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme/tokens';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.page, card: colors.card, text: colors.ink, border: colors.line, primary: colors.primary } };

// NativeWind(css-interop)가 로드 시 RN 0.87에서 deprecated된 ImageBackground를 건드려 뜨는 경고 — 앱 코드와 무관
LogBox.ignoreLogs(['ImageBackground is deprecated']);

export default function App() {
  const bootstrap = useAuth(s => s.bootstrap);
  useEffect(() => { bootstrap(); }, [bootstrap]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.page }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer ref={navigationRef} theme={theme} linking={linking} fallback={<Splash />}>
            <StatusBar barStyle="light-content" />
            <RootNavigator />
          </NavigationContainer>
          <PreviewHost />
          <MiniDisc />
          <DialogHost />
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
