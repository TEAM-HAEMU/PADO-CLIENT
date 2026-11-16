const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');
// Sentry: 번들·소스맵에 Debug ID를 넣어 릴리스 빌드에서 올린 소스맵과 이벤트 스택을 잇는다
const { withSentryConfig } = require('@sentry/react-native/metro');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {};

module.exports = withSentryConfig(
  withNativeWind(mergeConfig(getDefaultConfig(__dirname), config), {
    input: './src/global.css',
  }),
);
