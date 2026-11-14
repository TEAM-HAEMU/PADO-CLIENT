# Xcode 빌드 단계에서 source 한다 (PWD=ios). Sentry 소스맵·dSYM 업로드를 할지 정한다.
#
#  - Debug 구성: Sentry 스크립트가 알아서 업로드를 건너뛴다 (토큰 필요 없음)
#  - 토큰: 환경변수 SENTRY_AUTH_TOKEN 또는 ios/sentry.properties 의 auth.token (npm run sentry:props)
#  - 토큰이 없으면 업로드만 건너뛰고 경고 (빌드는 계속)
#  - 토큰이 있으면 업로드 실패도 경고로 (SENTRY_ALLOW_FAILURE) — 번들이 실제로 만들어졌는지는 빌드 단계가 따로 확인
#  - 끄기: SENTRY_DISABLE_AUTO_UPLOAD=true
SENTRY_PROPERTIES="${SENTRY_PROPERTIES:-$SRCROOT/sentry.properties}"
export SENTRY_PROPERTIES

_pado_sentry_debug=false
echo "$CONFIGURATION" | grep -iq debug && _pado_sentry_debug=true

if [ "$SENTRY_DISABLE_AUTO_UPLOAD" = true ]; then
  :
elif [ -n "$SENTRY_AUTH_TOKEN" ] || grep -qE '^auth\.token=.+' "$SENTRY_PROPERTIES" 2>/dev/null; then
  export SENTRY_ALLOW_FAILURE="${SENTRY_ALLOW_FAILURE:-true}"
  # 환경변수 토큰만 있고 properties 파일이 없으면 프로젝트 기본값 (비밀 아님)
  if [ ! -f "$SENTRY_PROPERTIES" ]; then
    export SENTRY_URL="${SENTRY_URL:-https://de.sentry.io/}"
    export SENTRY_ORG="${SENTRY_ORG:-busansoftwaremeisterhighschool}"
    export SENTRY_PROJECT="${SENTRY_PROJECT:-react-native}"
  fi
else
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  if [ "$_pado_sentry_debug" = false ]; then
    echo "warning: Sentry 소스맵·dSYM 업로드를 건너뛰어요 — SENTRY_AUTH_TOKEN 또는 ios/sentry.properties가 없어요 (npm run sentry:props). 이 빌드의 오류 스택은 Sentry에서 풀리지 않아요."
  fi
fi
unset _pado_sentry_debug
