import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { PadoSymbol } from '@/components/ui/Brand';
import { Dock } from '@/components/ui/Dock';
import { startNotificationStream, stopNotificationStream } from '@/services/notificationsStream';
import { useLocation } from '@/services/location';
import { openPendingLink } from './linking';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { colors } from '@/theme/tokens';
import type { RootStackParamList, TabParamList } from './types';

import LoginScreen from '@/screens/auth/LoginScreen';
import EmailLoginScreen from '@/screens/auth/EmailLoginScreen';
import SignupScreen from '@/screens/auth/SignupScreen';
import LocationPermissionScreen from '@/screens/auth/LocationPermissionScreen';
import MapHomeScreen from '@/screens/map/MapHomeScreen';
import PinPreviewScreen from '@/screens/map/PinPreviewScreen';
import PlayerScreen from '@/screens/player/PlayerScreen';
import CommentsScreen from '@/screens/player/CommentsScreen';
import ServicePickerScreen from '@/screens/player/ServicePickerScreen';
import TermsUpdateScreen from '@/screens/me/TermsUpdateScreen';
import TermsViewScreen from '@/screens/me/TermsViewScreen';
import PlaylistPickerScreen from '@/screens/detail/PlaylistPickerScreen';
import DropTypeScreen from '@/screens/drop/DropTypeScreen';
import SongSearchScreen from '@/screens/drop/SongSearchScreen';
import NoteScreen from '@/screens/drop/NoteScreen';
import VoteCreateScreen from '@/screens/drop/VoteCreateScreen';
import PlaylistDropCreateScreen from '@/screens/drop/PlaylistDropCreateScreen';
import DropSuccessScreen from '@/screens/drop/DropSuccessScreen';
import VoteDropScreen from '@/screens/detail/VoteDropScreen';
import PlaylistDropScreen from '@/screens/detail/PlaylistDropScreen';
import PlaylistDetailScreen from '@/screens/detail/PlaylistDetailScreen';
import AddSongsScreen from '@/screens/detail/AddSongsScreen';
import TrackMenuScreen from '@/screens/detail/TrackMenuScreen';
import PlaylistsScreen from '@/screens/me/PlaylistsScreen';
import NewPlaylistScreen from '@/screens/me/NewPlaylistScreen';
import NotificationsScreen from '@/screens/me/NotificationsScreen';
import ProfileScreen from '@/screens/me/ProfileScreen';
import ProfileEditScreen from '@/screens/me/ProfileEditScreen';
import SettingsScreen from '@/screens/me/SettingsScreen';
import BlockedUsersScreen from '@/screens/me/BlockedUsersScreen';
import ConfirmWithdrawScreen from '@/screens/me/ConfirmWithdrawScreen';
import ReportScreen from '@/screens/me/ReportScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator tabBar={props => <Dock {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.page } }}>
      <Tab.Screen name="Map" component={MapHomeScreen} />
      <Tab.Screen name="Playlists" component={PlaylistsScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Android(New Arch)에서 native-stack 'fade' 전환이 투명한 채로 멈춰 화면이 안 보이는 경우가 있어 Android는 즉시 전환
const FADE = Platform.OS === 'ios' ? 'fade' : 'none';
const sheet: NativeStackNavigationOptions = { presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } };

export function Splash() {
  return <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}><PadoSymbol size={72} /></View>;
}

export function RootNavigator() {
  const status = useAuth(s => s.status);
  const locationPrompted = usePrefs(s => s.locationPrompted);
  // 위치가 바뀔 때마다 전체 내비게이터가 다시 그려지지 않게 필요한 값만 구독
  const permission = useLocation(s => s.permission);
  const refreshPermission = useLocation(s => s.refreshPermission);

  useEffect(() => { refreshPermission(); }, [refreshPermission]);
  // 로그인 전에 눌렀던 링크가 있으면 로그인 직후 그 화면으로
  const needLocationNow = !locationPrompted && permission !== 'granted';
  useEffect(() => {
    if (status !== 'authed' || needLocationNow) return; // 위치 안내를 먼저 마친 뒤
    const t = setTimeout(openPendingLink, 400);
    return () => clearTimeout(t);
  }, [status, needLocationNow]);
  useEffect(() => {
    if (status === 'authed') startNotificationStream();
    else stopNotificationStream();
    return stopNotificationStream;
  }, [status]);

  if (status === 'loading') return <Splash />;
  const needLocation = !locationPrompted && permission !== 'granted';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page }, animation: 'slide_from_right' }}>
      {status === 'guest' ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ animation: FADE }} />
          <Stack.Screen name="TermsView" component={TermsViewScreen} />
          <Stack.Screen name="EmailLogin" component={EmailLoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </>
      ) : (
        <>
          {needLocation ? <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} options={{ animation: FADE }} /> : null}
          <Stack.Screen name="Tabs" component={Tabs} options={{ animation: FADE }} />
          <Stack.Screen name="Player" component={PlayerScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="SongSearch" component={SongSearchScreen} />
          <Stack.Screen name="Note" component={NoteScreen} />
          <Stack.Screen name="VoteCreate" component={VoteCreateScreen} />
          <Stack.Screen name="PlaylistDropCreate" component={PlaylistDropCreateScreen} />
          <Stack.Screen name="DropSuccess" component={DropSuccessScreen} options={{ animation: FADE, gestureEnabled: false }} />
          <Stack.Screen name="VoteDrop" component={VoteDropScreen} />
          <Stack.Screen name="PlaylistDrop" component={PlaylistDropScreen} />
          <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
          <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="TermsView" component={TermsViewScreen} />
          <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
          <Stack.Group screenOptions={sheet}>
            <Stack.Screen name="PinPreview" component={PinPreviewScreen} />
            <Stack.Screen name="Comments" component={CommentsScreen} />
            <Stack.Screen name="ServicePicker" component={ServicePickerScreen} />
            <Stack.Screen name="DropType" component={DropTypeScreen} />
            <Stack.Screen name="AddSongs" component={AddSongsScreen} />
            <Stack.Screen name="TrackMenu" component={TrackMenuScreen} />
            <Stack.Screen name="NewPlaylist" component={NewPlaylistScreen} />
            <Stack.Screen name="Report" component={ReportScreen} />
            <Stack.Screen name="PlaylistPicker" component={PlaylistPickerScreen} />
            <Stack.Screen name="TermsUpdate" component={TermsUpdateScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="ConfirmWithdraw" component={ConfirmWithdrawScreen} options={{ animation: FADE }} />
          </Stack.Group>
        </>
      )}
    </Stack.Navigator>
  );
}
