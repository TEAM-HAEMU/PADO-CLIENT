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
    // 카카오 SDK는 키로 초기화되기 전에 호출하면 fatal error — 키가 있고 kakao 스킴일 때만 넘긴다
    let kakaoKey = (Bundle.main.object(forInfoDictionaryKey: "KAKAO_APP_KEY") as? String) ?? ""
    if !kakaoKey.isEmpty, url.scheme?.hasPrefix("kakao") == true, AuthApi.isKakaoTalkLoginUrl(url) {
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
