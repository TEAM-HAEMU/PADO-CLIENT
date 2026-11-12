import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import GoogleMaps
import KakaoSDKAuth
import KakaoSDKCommon
import GoogleSignIn

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Google Maps — Info.plist의 GMSApiKey(.env → scripts/sync-native-env.js)가 있을 때만 활성화.
    // 비어 있으면 JS가 Apple Maps로 대체한다.
    if let mapsKey = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String, !mapsKey.isEmpty {
      GMSServices.provideAPIKey(mapsKey)
    }

    // 카카오 SDK는 앱이 뜨자마자 초기화한다 — 카카오톡이 로그인 결과를 들고 앱을 '새로 실행'시키면
    // JS 모듈(RNKakaoLogins)이 아직 안 떠서 SDK가 비어 있고, 아래 open url 처리에서 fatal error가 난다
    if let kakaoKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_APP_KEY") as? String, !kakaoKey.isEmpty {
      KakaoSDK.initSDK(appKey: kakaoKey)
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "PADO",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // 소셜 로그인 앱 전환 복귀 처리 (카카오톡 / Google)
  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // 카카오 SDK는 초기화 전에 호출하면 fatal error — 초기화됐고 kakao 스킴일 때만 넘긴다
    if url.scheme?.hasPrefix("kakao") == true, (try? KakaoSDK.shared.appKey()) != nil, AuthApi.isKakaoTalkLoginUrl(url) {
      return AuthController.handleOpenUrl(url: url)
    }
    if url.scheme?.hasPrefix("com.googleusercontent.apps") == true, GIDSignIn.sharedInstance.handle(url) {
      return true
    }
    return RCTLinkingManager.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
