package com.pado.app

import android.os.Bundle
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "PADO"

  override fun onCreate(savedInstanceState: Bundle?) {
    // 저장된 상태는 넘기지 않는다 — react-native-screens는 화면 프래그먼트 복원을 지원하지 않아서,
    // Activity가 다시 만들어질 때(글꼴 크기·언어·화면 배율 변경, 백그라운드에서 프로세스가 회수된 뒤 복귀 등) 넘기면
    // "Screen fragments should never be restored"로 앱이 죽는다. 화면은 JS가 처음부터 다시 그린다.
    super.onCreate(null)
    // 앱 화면이 항상 어두우므로 시스템이 라이트 모드여도 상태/내비게이션 바 아이콘은 밝게
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
