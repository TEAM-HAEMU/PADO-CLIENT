#!/bin/bash
# 실제 iPhone에 Release 빌드 설치·실행 (JS 번들 포함 — Metro 없이 동작, .env 설정 그대로 = 실서버)
#
#   TEAM_ID=XXXXXXXXXX npm run ios:device
#
# 준비 (한 번만):
#   1) Xcode › Settings › Accounts 에서 Apple ID 추가 (무료 개인 팀도 됨 — 설치본은 7일간 유효)
#   2) 팀 ID 확인: Xcode › Settings › Accounts › 팀 선택, 또는 이 스크립트를 TEAM_ID 없이 실행하면 목록 표시
#   3) iPhone: 설정 › 개인정보 보호 및 보안 › 개발자 모드 켜기, 같은 Wi-Fi 또는 케이블 연결
#   4) 무료 개인 팀이면 첫 실행 후 iPhone: 설정 › 일반 › VPN 및 기기 관리 › 개발자 앱 신뢰
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${TEAM_ID:-}" ]; then
  echo "TEAM_ID가 필요해요. 이 Mac의 개발 팀:" >&2
  security find-identity -v -p codesigning | grep -oE '\(([A-Z0-9]{10})\)' | sort -u | tr -d '()' >&2 || true
  echo "없으면 Xcode › Settings › Accounts 에서 Apple ID를 먼저 추가하세요." >&2
  exit 1
fi

# 연결된 iPhone (DEVICE_UDID로 직접 지정 가능)
UDID="${DEVICE_UDID:-}"
if [ -z "$UDID" ]; then
  tmp="$(mktemp)"
  xcrun devicectl list devices --json-output "$tmp" >/dev/null
  UDID="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(next((x['hardwareProperties']['udid'] for x in d['result']['devices'] if x.get('hardwareProperties',{}).get('platform')=='iOS' and x.get('connectionProperties',{}).get('pairingState')=='paired'), ''))" "$tmp")"
  rm -f "$tmp"
fi
[ -n "$UDID" ] || { echo "연결된 iPhone을 찾지 못했어요." >&2; exit 1; }
echo "▶ iPhone $UDID · 팀 $TEAM_ID"

node scripts/sync-native-env.js
xcodebuild -workspace ios/PADO.xcworkspace -scheme PADO -configuration Release \
  -destination "id=$UDID" -derivedDataPath ios/build/device \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
  build | grep -E "error:|warning: .*[Ss]ign|\*\* BUILD" || true

APP="ios/build/device/Build/Products/Release-iphoneos/PADO.app"
[ -d "$APP" ] || { echo "빌드 실패 — 위 오류를 확인하세요." >&2; exit 1; }
xcrun devicectl device install app --device "$UDID" "$APP"
xcrun devicectl device process launch --device "$UDID" com.pado.app || echo "설치됨 — 실행이 막히면 iPhone에서 개발자 앱을 신뢰하세요 (설정 › 일반 › VPN 및 기기 관리)."
