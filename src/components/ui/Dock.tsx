/** 하단 도크 — Figma "B/Dock": 지도 · 플리 · (가운데 원형 드랍 버튼) · 알림 · 프로필 */
import React from 'react';
import { View, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, glow } from '@/theme/tokens';
import { useUnreadCount } from '@/hooks/api';
import { Icon, type IconName } from './Icon';
import { Press } from './index';

const LABELS: Record<string, string> = { Map: '지도', Playlists: '플리', Notifications: '알림', Profile: '프로필' };

const ICONS: Record<string, IconName> = { Map: 'map', Playlists: 'playlist', Notifications: 'bell', Profile: 'user' };

export function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount().data ?? 0;
  const routes = state.routes;
  const item = (i: number) => {
    const r = routes[i];
    const focused = state.index === i;
    return (
      <Press key={r.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={`${LABELS[r.name] ?? r.name}${r.name === 'Notifications' && unread > 0 ? `, 읽지 않은 알림 ${unread}개` : ''}`} onPress={() => navigation.navigate(r.name)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: 68 }}>
        <View>
          <Icon name={ICONS[r.name]} size={24} color={focused ? colors.primary : colors.ink3} />
          {r.name === 'Notifications' && unread > 0 ? <View style={{ position: 'absolute', right: -1, top: 1, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.card }} /> : null}
        </View>
        <View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, opacity: focused ? 1 : 0 }, focused ? glow(0.9, 6) : null]} />
      </Press>
    );
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom - 6, 12) }}>
      <View style={{ height: 68, borderRadius: 34, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        {/* Android 실시간 블러는 아래 지도가 다시 그려질 때마다 비용이 커서 반투명 배경으로 대신 */}
        {Platform.OS === 'ios' ? <BlurView blurType="dark" blurAmount={24} reducedTransparencyFallbackColor={colors.card} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: Platform.OS === 'ios' ? 'rgba(11,19,48,0.72)' : 'rgba(11,19,48,0.94)' }} />
        {item(0)}
        {item(1)}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Press accessibilityLabel="드랍하기" onPress={() => navigation.getParent()?.navigate('DropType')} style={[{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, glow(0.55, 20)]}>
            <Icon name="plus" size={26} color={colors.onPrimary} />
          </Press>
        </View>
        {item(2)}
        {item(3)}
      </View>
    </View>
  );
}
