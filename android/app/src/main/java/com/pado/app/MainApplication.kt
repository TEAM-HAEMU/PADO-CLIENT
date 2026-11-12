package com.pado.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.kakao.sdk.common.KakaoSdk
import com.pado.app.alphavideo.AlphaVideoPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(AlphaVideoPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // 카카오 SDK는 앱 시작 때 초기화 — 카카오톡에서 돌아오는 화면(AuthCodeHandlerActivity)이
    // JS 모듈보다 먼저 뜨는 경우(앱이 내려갔다가 다시 만들어질 때)에도 SDK가 준비돼 있게
    val kakaoKey = getString(R.string.kakao_app_key)
    if (kakaoKey.isNotBlank()) KakaoSdk.init(this, kakaoKey)
    loadReactNative(this)
  }
}
