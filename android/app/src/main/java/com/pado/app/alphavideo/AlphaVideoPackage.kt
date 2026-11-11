package com.pado.app.alphavideo

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.annotations.ReactProp

/** JS: requireNativeComponent('PadoAlphaVideo') — props: source(res/raw 이름), paused */
class AlphaVideoManager : SimpleViewManager<AlphaVideoView>() {
  override fun getName() = "PadoAlphaVideo"
  override fun createViewInstance(context: ThemedReactContext) = AlphaVideoView(context)

  @ReactProp(name = "source")
  fun setSource(view: AlphaVideoView, src: String?) = view.setSource(src)

  @ReactProp(name = "paused", defaultBoolean = false)
  fun setPaused(view: AlphaVideoView, paused: Boolean) = view.setPaused(paused)
}

class AlphaVideoPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = emptyList()
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = listOf(AlphaVideoManager())
}
