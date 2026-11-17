/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { registerPushBackground } from './src/services/pushBackground';
import { onBackgroundPress } from './src/services/push';

// 푸시: 백그라운드 수신·알림 누름 핸들러는 앱 등록 전에
registerPushBackground(onBackgroundPress);

AppRegistry.registerComponent(appName, () => App);
