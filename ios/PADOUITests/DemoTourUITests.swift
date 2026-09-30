import XCTest

/// 시연 영상용 자동 투어 (목 서버 모드에서 실행). 실제 탭·입력으로 핵심 흐름을 한 바퀴 돈다.
/// 녹화: xcrun simctl io booted recordVideo demo.mp4 를 켜둔 채 이 테스트를 실행.
final class DemoTourUITests: XCTestCase {
  let app = XCUIApplication()

  override func setUp() {
    continueAfterFailure = true
    // 테스트 중엔 미리듣기를 무음으로 (앱이 NSUserDefaults의 PADO_MUTE를 읽는다)
    app.launchArguments += ["-PADO_MUTE", "YES"]
  }

  /// 같은 라벨이 아래 화면에도 있을 수 있어서, 실제로 탭 가능한(가려지지 않은) 요소를 고른다
  private func any(_ label: String) -> XCUIElement {
    let q = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label))
    _ = q.firstMatch.waitForExistence(timeout: 8)
    return q.allElementsBoundByIndex.last(where: { $0.isHittable }) ?? q.firstMatch
  }

  /// 하단 탭 (라벨 뒤에 '읽지 않은 알림 n개'가 붙을 수 있음)
  private func dockTab(_ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", name, name + ",")).firstMatch
  }

  private func containing(_ text: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
  }

  @discardableResult
  private func tap(_ e: XCUIElement, timeout: TimeInterval = 10) -> Bool {
    guard e.waitForExistence(timeout: timeout) else { return false }
    e.tap()
    return true
  }

  /// 앱 자체 확인창·메뉴(components/ui/Dialog)의 버튼
  private func dialogButton(_ text: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "dialog-" + text).firstMatch
  }

  /// 설정 맨 아래 '로그아웃' → 확인창 '로그아웃'. 스크롤이 멈추기 전 탭은 스크롤만 멈추므로 확인창이 뜰 때까지 다시 누름
  private func confirmLogout() {
    for _ in 0..<3 {
      tap(containing("로그아웃"), timeout: 4)
      if dialogButton("로그아웃").waitForExistence(timeout: 3) { dialogButton("로그아웃").tap(); break }
      pause(1)
    }
  }

  private func pause(_ s: Double) { Thread.sleep(forTimeInterval: s) }

  /// 바텀시트 바깥(화면 위쪽 배경)을 탭해 닫기
  private func closeSheet() {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.07)).tap()
  }

  /// 녹화 전 준비: 로그인돼 있으면 설정 → 로그아웃 (녹화 대상 아님)
  func testPrepareSignedOut() {
    app.launch()
    pause(4)
    if any("이메일로 계속하기").waitForExistence(timeout: 4) { return }
    tap(dockTab("프로필"))
    pause(1.5)
    tap(any("설정"))
    pause(1.5)
    app.swipeUp()
    app.swipeUp()
    pause(1)
    pause(1)
    confirmLogout()
    pause(2)
    XCTAssertTrue(any("이메일로 계속하기").waitForExistence(timeout: 8))
  }

  func testDemoTour() {
    app.launch()
    pause(3)

    // 1) 로그인 — 이메일 (목 계정이 미리 채워져 있음)
    if tap(any("이메일로 계속하기"), timeout: 6) {
      pause(1.5)
      tap(any("로그인"))
      pause(2.5)
    }
    if any("위치 허용하기").waitForExistence(timeout: 3) {
      tap(any("위치 허용하기"))
      pause(2)
    }

    // 2) 지도 홈
    pause(4)

    // 3) 가까운 드랍 → 핀 미리보기 → 30초 미리듣기
    tap(containing("난춘"))   // 핀을 열면 미리듣기가 바로 재생됨
    pause(7)

    // 4) 재생 화면
    tap(any("재생 화면 열기"))
    pause(6)
    tap(any("좋아요"))
    pause(1.5)

    // 5) 댓글 남기기
    tap(any("댓글"))
    pause(2)
    let field = app.textFields.firstMatch
    if field.waitForExistence(timeout: 5) {
      field.tap()
      field.typeText("강바람 맞으면서 들으니까 최고예요")
      pause(1)
      tap(any("보내기"))
      pause(2.5)
    }
    closeSheet()            // 댓글 시트
    pause(1.5)
    tap(any("재생 화면 닫기"))   // 핀 미리보기는 재생 화면으로 바뀌었으므로 바로 지도
    pause(2)

    // 6) 투표 드랍
    tap(containing("퇴근길 강변에"))
    pause(3)
    tap(containing("Everything"))
    pause(3)
    tap(any("뒤로"))
    pause(2)

    // 7) 음악 드랍 만들기
    tap(any("드랍하기"))
    pause(2)
    tap(containing("한 곡을 골라"))
    pause(1.5)
    let search = app.textFields.firstMatch
    if search.waitForExistence(timeout: 5) {
      search.typeText("밤편지")
      pause(2.5)
    }
    // 실서버 검색(목 모드도 곡 검색은 실서버)이면 영문 제목, 실패 시 목 데이터
    let real = containing("Through the Night")
    tap(real.waitForExistence(timeout: 6) ? real : containing("아이유"))
    pause(2)
    tap(any("다음"))
    pause(2)
    let note = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
    if note.waitForExistence(timeout: 5) {
      note.tap()
      note.typeText("서낙동강 따라 걸으면서 들어요")
      pause(1.5)
    }
    tap(any("여기에 드랍하기"))
    pause(4)
    tap(any("지도에서 보기"))
    pause(3.5)

    // 8) 플리
    tap(dockTab("플리"))
    pause(2.5)
    tap(containing("새벽 드라이브"))
    pause(3.5)
    tap(any("뒤로"))
    pause(1.5)

    // 9) 알림 · 프로필
    tap(dockTab("알림"))
    pause(3)
    tap(dockTab("프로필"))
    pause(3.5)
    tap(dockTab("지도"))
    pause(3)
  }

  /// 전체 기능 투어 (검증 + 시연 영상용) — 약관 · 로그인 · 지도 · 미리듣기 · 재생 · 좋아요/댓글 작성·삭제 · 투표 ·
  /// 플리 드랍 전체 재생·다음 곡 · 음악 드랍 만들기 · 플리 만들기·곡 담기 · 알림 · 프로필 · 설정(기본 재생 앱·거리 표시) · 로그아웃
  func testFullTour() {
    app.launch()
    pause(3)
    // 이전 실행에서 로그인된 상태면 먼저 로그아웃 (녹화 시작 화면을 로그인 화면으로)
    if !any("이메일로 계속하기").waitForExistence(timeout: 4) {
      tap(dockTab("프로필")); pause(1.5)
      tap(any("설정")); pause(1.5)
      app.swipeUp(); app.swipeUp(); pause(1)
      pause(1); confirmLogout()
      pause(2.5)
    }

    // 1) 로그인 (목 계정이 미리 채워져 있음)
    XCTAssertTrue(any("카카오로 계속하기").waitForExistence(timeout: 8), "로그인 화면이 아님")
    XCTAssertFalse(containing("네이버").exists, "네이버 로그인이 남아 있음")
    pause(2)
    tap(any("이메일로 계속하기")); pause(1.5)
    tap(any("로그인")); pause(2.5)
    if any("위치 허용하기").waitForExistence(timeout: 3) { tap(any("위치 허용하기")); pause(2) }

    // 2) 지도 홈 — 주변 드랍 · 주변 곡 자동 재생
    XCTAssertTrue(containing("가까운 드랍").waitForExistence(timeout: 10), "지도 홈이 안 보임")
    let disc = containing("재생 중인 곡")
    XCTAssertTrue(disc.waitForExistence(timeout: 12), "주변 곡 자동 재생(미니 디스크)이 시작되지 않음")
    pause(4)
    disc.press(forDuration: 1.0); pause(4)   // 길게 누르면 다음 주변 곡

    // 3) 핀 미리보기(열면 자동 재생) → 재생 화면
    tap(containing("난춘")); pause(5)
    tap(any("재생 화면 열기")); pause(3)
    XCTAssertTrue(any("일시정지").waitForExistence(timeout: 8), "미리듣기가 재생 화면에서 이어지지 않음")
    pause(3)
    tap(any("일시정지")); pause(1.5)
    XCTAssertTrue(any("재생").waitForExistence(timeout: 4), "일시정지가 안 됨")
    tap(any("재생")); pause(2)

    // 4) 좋아요 · 댓글 작성 → 삭제
    tap(any("좋아요")); pause(1.5)
    tap(any("댓글")); pause(2)
    let field = app.textFields.firstMatch
    if field.waitForExistence(timeout: 5) {
      field.tap()
      field.typeText("강바람 맞으면서 들으니까 최고예요")
      pause(1)
      tap(any("보내기")); pause(2.5)
      XCTAssertTrue(containing("강바람 맞으면서").waitForExistence(timeout: 6), "댓글이 등록되지 않음")
      let menus = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "댓글 메뉴"))
      if menus.count > 0 {
        menus.element(boundBy: menus.count - 1).tap(); pause(1.5)
        if dialogButton("삭제").waitForExistence(timeout: 4) { dialogButton("삭제").tap(); pause(1.5) }
        if dialogButton("삭제").waitForExistence(timeout: 4) { dialogButton("삭제").tap(); pause(2) }
        XCTAssertFalse(containing("강바람 맞으면서").waitForExistence(timeout: 2), "댓글이 삭제되지 않음")
      }
    }
    closeSheet(); pause(1.5)
    tap(any("재생 화면 닫기")); pause(2)

    // 5) 투표 드랍 — 투표하기
    tap(containing("퇴근길 강변에")); pause(3)
    tap(containing("Everything")); pause(2.5)
    XCTAssertTrue(containing("다시 누르면 투표를 취소해요").waitForExistence(timeout: 6), "투표가 반영되지 않음")
    pause(1.5)
    tap(any("뒤로")); pause(2)

    // 6) 플리 드랍 — 전체 재생 · 다음 곡 (자동 재생은 미리듣기)
    tap(containing("봉림동 퇴근길")); pause(3)
    tap(containing("전체 재생")); pause(4)
    XCTAssertTrue(containing("1 / 8").waitForExistence(timeout: 6), "플리 전체 재생 대기열 없음")
    tap(any("다음 곡")); pause(4)
    XCTAssertTrue(containing("2 / 8").waitForExistence(timeout: 6), "다음 곡으로 안 넘어감")
    pause(2)
    tap(any("재생 화면 닫기")); pause(1.5)
    tap(any("뒤로")); pause(2)

    // 7) 음악 드랍 만들기 (곡 검색 → 메모 → 드랍)
    tap(any("드랍하기")); pause(2)
    tap(containing("한 곡을 골라")); pause(1.5)
    let search = app.textFields.firstMatch
    if search.waitForExistence(timeout: 5) { search.typeText("밤편지"); pause(2.5) }
    let real = containing("Through the Night")
    tap(real.waitForExistence(timeout: 6) ? real : containing("아이유")); pause(2)
    XCTAssertTrue(any("미리듣기 일시정지").waitForExistence(timeout: 8), "곡을 골라도 미리듣기가 자동 재생되지 않음")
    pause(2)
    tap(any("다음")); pause(2)
    XCTAssertTrue(any("미리듣기 일시정지").waitForExistence(timeout: 5), "한마디 화면에서 미리듣기가 끊김")
    let note = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
    if note.waitForExistence(timeout: 5) { note.tap(); note.typeText("서낙동강 따라 걸으면서 들어요"); pause(1.5) }
    tap(any("여기에 드랍하기")); pause(4)
    XCTAssertTrue(any("지도에서 보기").waitForExistence(timeout: 8), "드랍 완료 화면이 안 뜸")
    tap(any("지도에서 보기")); pause(3)

    // 8) 플리 만들기 → 곡 담기
    tap(dockTab("플리")); pause(2.5)
    tap(any("새 플레이리스트")); pause(2)
    let name = app.textFields.firstMatch
    if name.waitForExistence(timeout: 5) { name.tap(); name.typeText("강변 산책"); pause(1) }
    tap(any("만들고 곡 담으러 가기")); pause(3)
    XCTAssertTrue(containing("주변 드랍").waitForExistence(timeout: 6), "만든 뒤 곡 담기 화면으로 안 넘어감")
    tap(containing("주변 드랍")); pause(2.5)
    tap(containing("난춘")); pause(1.5)
    tap(containing("완료")); pause(3)
    XCTAssertTrue(containing("강변 산책").waitForExistence(timeout: 6), "새 플레이리스트가 안 보임")
    XCTAssertTrue(containing("1곡").waitForExistence(timeout: 6), "곡이 담기지 않음")
    pause(2)
    tap(any("뒤로")); pause(2)

    // 9) 알림 · 프로필
    tap(dockTab("알림")); pause(2.5)
    if containing("모두 읽음").exists { tap(containing("모두 읽음")); pause(1.5) }
    tap(dockTab("프로필")); pause(3)

    // 10) 설정 — 기본 재생 앱 · 거리 표시 · 약관
    tap(any("설정")); pause(2)
    tap(containing("기본 재생 앱")); pause(2)
    tap(any("Apple Music")); pause(1)
    tap(any("저장")); pause(2)
    XCTAssertTrue(containing("Apple Music").waitForExistence(timeout: 5), "기본 재생 앱이 저장되지 않음")
    tap(containing("반경")); pause(1.5)
    app.swipeUp(); pause(1)
    tap(containing("서비스 이용약관")); pause(2.5)
    XCTAssertTrue(containing("제1조 (목적)").waitForExistence(timeout: 5), "약관 본문이 안 보임")
    app.swipeUp(); pause(1.5)
    tap(any("뒤로")); pause(1.5)

    // 11) 로그아웃
    app.swipeUp(); pause(1)
    pause(1); confirmLogout()
    XCTAssertTrue(any("이메일로 계속하기").waitForExistence(timeout: 8), "로그아웃 후 로그인 화면이 아님")
    pause(3)
  }

  /// 실서버 실계정 투어 (녹화용, 소리 켬). 가입 화면을 채운 뒤 사람이 비밀번호를 넣고 가입할 때까지 기다렸다가
  /// 실서버 데이터로 드랍 만들기 · 미리듣기 · 재생 · 좋아요 · 댓글 · 플리 만들기·곡 담기·전체 재생 · 프로필 · 설정을 돈다.
  /// 환경변수 PADO_SIGNUP_EMAIL · PADO_SIGNUP_NAME · PADO_SIGNUP_BIRTH(YYYYMMDD) · PADO_SIGNUP_MALE(1/0)
  func testRealTour() {
    let env = ProcessInfo.processInfo.environment
    app.launchArguments = []   // 소리 켬 (PADO_MUTE 없음)
    app.launch()
    pause(3)

    // 0) 가입 화면 채우기 → 사람이 비밀번호 입력·가입 (최대 15분 대기)
    if any("이메일로 계속하기").waitForExistence(timeout: 5) {
      tap(any("이메일로 계속하기")); pause(1.5)
      tap(containing("계정 만들기")); pause(2)
      let email = app.textFields["이메일"]
      if email.waitForExistence(timeout: 5) { email.tap(); email.typeText(env["PADO_SIGNUP_EMAIL"] ?? "") }
      let name = app.textFields["닉네임"]
      if name.waitForExistence(timeout: 3) { name.tap(); name.typeText(env["PADO_SIGNUP_NAME"] ?? "") }
      let birth = app.textFields["생년월일"]
      if birth.waitForExistence(timeout: 3) { birth.tap(); birth.typeText(env["PADO_SIGNUP_BIRTH"] ?? "") }
      tap(any(env["PADO_SIGNUP_MALE"] == "0" ? "여성" : "남성")); pause(0.5)
      app.swipeUp(); pause(1)
      tap(containing("전체 동의")); pause(1)
      app.swipeDown(); pause(1)
      tap(any("계정 만들기")); pause(1)   // 키보드 내리기 — 비밀번호 칸·가입 버튼이 보이게
      XCTAssertTrue(containing("가까운 드랍").waitForExistence(timeout: TimeInterval(env["PADO_SIGNUP_WAIT_SEC"] ?? "") ?? 900), "가입(로그인)이 완료되지 않음")
    }
    if any("위치 허용하기").waitForExistence(timeout: 3) { tap(any("위치 허용하기")); pause(2) }
    pause(4)

    // 1) 음악 드랍 만들기 — 실서버 곡 검색
    tap(any("드랍하기")); pause(2)
    tap(containing("한 곡을 골라")); pause(1.5)
    let search = app.textFields.firstMatch
    if search.waitForExistence(timeout: 5) { search.typeText("밤편지"); pause(3) }
    tap(containing("Through the Night")); pause(2)
    tap(any("다음")); pause(2)
    let note = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
    if note.waitForExistence(timeout: 5) { note.tap(); note.typeText("서낙동강 따라 걸으면서 들어요"); pause(1.5) }
    tap(any("여기에 드랍하기")); pause(4)
    XCTAssertTrue(any("지도에서 보기").waitForExistence(timeout: 10), "드랍이 등록되지 않음")
    tap(any("지도에서 보기")); pause(4)

    // 2) 내가 남긴 드랍 → 미리듣기 → 재생 화면 → 좋아요 · 댓글
    tap(containing("Through the Night")); pause(10)   // 핀을 열면 자동 재생
    tap(any("재생 화면 열기")); pause(8)
    tap(any("좋아요")); pause(2)
    tap(any("댓글")); pause(2)
    let field = app.textFields.firstMatch
    if field.waitForExistence(timeout: 5) {
      field.tap(); field.typeText("강바람 맞으면서 들으니까 최고예요"); pause(1)
      tap(any("보내기")); pause(3)
      XCTAssertTrue(containing("강바람 맞으면서").waitForExistence(timeout: 8), "댓글이 등록되지 않음")
    }
    closeSheet(); pause(1.5)
    tap(any("재생 화면 닫기")); pause(2)

    // 3) 플리 만들기 → 곡 담기(검색) → 전체 재생
    tap(dockTab("플리")); pause(2.5)
    tap(any("새 플레이리스트")); pause(2)
    let pl = app.textFields.firstMatch
    if pl.waitForExistence(timeout: 5) { pl.tap(); pl.typeText("강변 산책"); pause(1) }
    tap(any("만들고 곡 담으러 가기")); pause(3)
    let q = app.textFields.firstMatch
    if q.waitForExistence(timeout: 5) { q.typeText("새소년"); pause(3.5) }
    tap(containing("NAN CHUN")); pause(0.8)
    tap(containing("A Long Dream")); pause(0.8)
    tap(containing("The Wave")); pause(0.8)
    tap(containing("완료")); pause(3)
    XCTAssertTrue(containing("강변 산책").waitForExistence(timeout: 8), "새 플리가 안 보임")
    tap(containing("전체 재생")); pause(12)
    tap(any("다음 곡")); pause(8)
    tap(any("재생 화면 닫기")); pause(1.5)
    tap(any("뒤로")); pause(2)

    // 4) 알림 · 프로필 · 설정
    tap(dockTab("알림")); pause(3)
    tap(dockTab("프로필")); pause(4)
    tap(any("설정")); pause(2.5)
    tap(containing("기본 재생 앱")); pause(2)
    tap(any("Spotify")); pause(1)
    tap(any("저장")); pause(2)
    app.swipeUp(); pause(1)
    tap(containing("서비스 이용약관")); pause(3)
    app.swipeUp(); pause(1.5)
    tap(any("뒤로")); pause(1.5)
    app.swipeDown(); pause(1)
    tap(any("뒤로")); pause(1.5)
    tap(dockTab("지도")); pause(4)
  }

  /// 디자인 비교용 — 주요 화면을 차례로 열어 스크린샷을 첨부 (xcresult에 저장)
  func testScreens() {
    app.launch()
    pause(3)
    if tap(any("이메일로 계속하기"), timeout: 4) { pause(1); tap(any("로그인")); pause(2.5) }
    if any("위치 허용하기").waitForExistence(timeout: 2) { tap(any("위치 허용하기")); pause(2) }
    func shot(_ name: String) {
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = name; a.lifetime = .keepAlways; add(a)
    }
    pause(4); shot("map")
    tap(containing("퇴근길 강변에")); pause(3); shot("vote")
    tap(any("뒤로")); pause(1.5)
    tap(containing("봉림동 퇴근길")); pause(3); shot("playlistDrop")
    tap(any("뒤로")); pause(1.5)
    tap(dockTab("알림")); pause(2.5); shot("notifications")
    tap(dockTab("프로필")); pause(3); shot("profile")
    tap(any("설정")); pause(2); shot("settings")
    tap(any("뒤로")); pause(1)
    tap(dockTab("플리")); pause(2.5); shot("playlists")
    tap(any("드랍하기")); pause(2); tap(containing("2~5곡")); pause(2); shot("voteCreate")
  }

  /// 재현: 플리 상세 → 뒤로 가 앱이 살아 있는지
  func testPlaylistBack() {
    app.launch()
    pause(3)
    if tap(any("이메일로 계속하기"), timeout: 4) { pause(1); tap(any("로그인")); pause(2.5) }
    pause(3)
    tap(dockTab("플리")); pause(2.5)
    tap(containing("새벽 드라이브")); pause(3)
    tap(any("뒤로")); pause(3)
    XCTAssertEqual(app.state, .runningForeground, "플리 상세에서 뒤로 간 뒤 앱이 종료됨")
    tap(containing("새벽 드라이브")); pause(3)
    app.swipeRight(); pause(3)
    XCTAssertEqual(app.state, .runningForeground, "스와이프 뒤로 후 종료")
    // 전체 재생 → 대기열 표시(1 / 4)와 자동 재생
    tap(containing("새벽 드라이브")); pause(3)
    tap(containing("전체 재생")); pause(4)
    XCTAssertTrue(containing("1 / 4").waitForExistence(timeout: 6), "전체 재생 대기열이 표시되지 않음")
    XCTAssertTrue(any("일시정지").waitForExistence(timeout: 8), "전체 재생이 자동으로 시작되지 않음")
    // 플리 드랍(곡 정보가 캐시에 없음) → 다음 곡으로 넘겨도 자동 재생
    tap(any("재생 화면 닫기")); pause(1.5)
    tap(any("뒤로")); pause(1.5)
    tap(dockTab("지도")); pause(3)
    tap(containing("봉림동 퇴근길")); pause(3)
    tap(containing("전체 재생")); pause(4)
    tap(any("다음 곡")); pause(5)
    XCTAssertTrue(containing("2 / 8").waitForExistence(timeout: 6), "다음 곡으로 넘어가지 않음")
    XCTAssertTrue(any("일시정지").waitForExistence(timeout: 10), "다음 곡이 자동 재생되지 않음")
  }

  /// 디자인 비교용 2 — 시트·편집 화면들
  func testScreens2() {
    app.launch()
    pause(3)
    func shot(_ name: String) {
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = name; a.lifetime = .keepAlways; add(a)
    }
    if tap(any("이메일로 계속하기"), timeout: 4) {
      pause(1)
      tap(containing("계정 만들기")); pause(2); shot("signup")
      tap(any("뒤로")); pause(1)
      tap(any("로그인")); pause(2.5)
    }
    pause(3)
    tap(dockTab("플리")); pause(2.5)
    tap(containing("새벽 드라이브")); pause(3)
    tap(containing("곡 추가")); pause(2.5); shot("addSongs")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap(); pause(1.5)
    tap(any("곡 메뉴")); pause(2); shot("trackMenu")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.07)).tap(); pause(1.5)
    tap(any("뒤로")); pause(1.5)
    tap(any("새 플레이리스트")); pause(2); shot("newPlaylist")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.07)).tap(); pause(1.5)
    tap(dockTab("프로필")); pause(2.5)
    tap(containing("프로필 편집")); pause(2.5); shot("profileEdit")
    tap(any("뒤로")); pause(1)
    tap(any("설정")); pause(2)
    tap(containing("기본 재생 앱")); pause(2); shot("servicePicker")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.07)).tap(); pause(1.5)
    app.swipeUp(); app.swipeUp(); pause(1)
    tap(any("회원 탈퇴")); pause(2); shot("withdraw")
  }

  /// 피그마 동기화용 — 모든 화면을 흐름 순서대로 캡처 (xcresult 첨부, 이름 앞 번호 = 순서)
  func testAllScreens() {
    app.launch()
    pause(3)
    var n = 0
    func shot(_ name: String) {
      n += 1
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "%02d_%@", n, name); a.lifetime = .keepAlways; add(a)
    }
    func back() { tap(any("뒤로"), timeout: 3); pause(1.2) }
    // 로그아웃 상태로
    if !any("이메일로 계속하기").waitForExistence(timeout: 4) {
      tap(dockTab("프로필")); pause(1.5); tap(any("설정")); pause(1.5)
      app.swipeUp(); app.swipeUp(); pause(1)
      pause(1); confirmLogout()
      pause(2.5)
    }
    // 1 온보딩·인증
    pause(2); shot("login")
    tap(any("이메일로 계속하기")); pause(1.5); shot("emailLogin")
    tap(containing("계정 만들기")); pause(2); shot("signup")
    back()
    tap(any("로그인")); pause(2.5)
    if any("위치 허용하기").waitForExistence(timeout: 2) { shot("locationPermission"); tap(any("위치 허용하기")); pause(2) }
    // 2 지도·재생
    pause(6); shot("map")
    tap(containing("난춘")); pause(4); shot("pinPreview")
    tap(any("재생 화면 열기")); pause(3.5); shot("player")
    tap(any("댓글")); pause(2.5); shot("comments")
    closeSheet(); pause(1.5)
    tap(any("재생 앱 바꾸기")); pause(2); shot("servicePicker")
    closeSheet(); pause(1.5)
    tap(any("재생 화면 닫기")); pause(2)
    // 4 드랍 상세
    tap(containing("퇴근길 강변에")); pause(3); shot("voteDrop")
    back()
    tap(containing("봉림동 퇴근길")); pause(3); shot("playlistDrop")
    back()
    // 3 드랍 만들기
    tap(any("드랍하기")); pause(2); shot("dropType")
    tap(containing("한 곡을 골라")); pause(1.5)
    let search = app.textFields.firstMatch
    if search.waitForExistence(timeout: 5) { search.typeText("밤편지"); pause(2.5) }
    let real = containing("Through the Night")
    tap(real.waitForExistence(timeout: 6) ? real : containing("아이유")); pause(2.5); shot("songSearch")
    tap(any("다음")); pause(2)
    let note = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
    if note.waitForExistence(timeout: 5) { note.tap(); note.typeText("서낙동강 따라 걸으면서 들어요"); pause(1.5) }
    shot("note")
    tap(any("여기에 드랍하기")); pause(4); shot("dropSuccess")
    tap(any("지도에서 보기")); pause(3)
    tap(any("드랍하기")); pause(2); tap(containing("2~5곡")); pause(2.5); shot("voteCreate")
    back(); pause(0.5)
    if !containing("여러 곡을 묶어").exists { tap(any("드랍하기")); pause(2) }
    tap(containing("여러 곡을 묶어")); pause(2.5); shot("playlistDropCreate")
    back(); closeSheet(); pause(1.5)
    // 5 내 공간
    tap(dockTab("플리")); pause(2.5); shot("playlists")
    tap(containing("새벽 드라이브")); pause(3); shot("playlistDetail")
    tap(containing("곡 추가")); pause(2.5); shot("addSongs")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap(); pause(1.5)
    tap(any("곡 메뉴")); pause(2); shot("trackMenu")
    tap(containing("다른 플리에 담기")); pause(2.5); shot("playlistPicker")
    closeSheet(); pause(1.5)
    back()
    tap(any("새 플레이리스트")); pause(2); shot("newPlaylist")
    closeSheet(); pause(1.5)
    tap(dockTab("알림")); pause(2.5); shot("notifications")
    tap(dockTab("프로필")); pause(3); shot("profile")
    tap(containing("프로필 편집")); pause(2.5); shot("profileEdit")
    back()
    tap(any("설정")); pause(2); shot("settings")
    app.swipeUp(); pause(1); shot("settings2")
    tap(containing("차단한 사용자")); pause(2); shot("blockedUsers")
    back()
    tap(containing("서비스 이용약관")); pause(2.5); shot("termsView")
    back()
    app.swipeUp(); pause(1)
    tap(any("회원 탈퇴")); pause(2); shot("withdraw")
    closeSheet(); pause(1)
    // 신고 (핀 더보기 → 신고하기)
    back()
    tap(dockTab("지도")); pause(3)
    tap(containing("파도")); pause(3.5)
    tap(any("더보기")); pause(1.5)
    let rep = app.buttons["신고하기"]
    if rep.waitForExistence(timeout: 3) { rep.tap(); pause(2.5); shot("report") }
  }

  /// 피그마 동기화용 2 — 핀·재생·시트 화면 (미니 디스크 라벨과 겹치지 않게 라벨 시작으로 찾음)
  func testAllScreens2() {
    app.launch()
    pause(3)
    var n = 30
    func shot(_ name: String) {
      n += 1
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "%02d_%@", n, name); a.lifetime = .keepAlways; add(a)
    }
    func starts(_ text: String) -> XCUIElement {
      app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", text)).firstMatch
    }
    if tap(any("이메일로 계속하기"), timeout: 4) { pause(1); tap(any("로그인")); pause(2.5) }
    pause(6)
    tap(starts("난춘")); pause(4); shot("pinPreview")
    tap(any("재생 화면 열기")); pause(3.5); shot("player")
    tap(any("댓글")); pause(2.5); shot("comments")
    closeSheet(); pause(1.5)
    tap(any("재생 앱 바꾸기")); pause(2); shot("servicePicker")
    closeSheet(); pause(1.5)
    tap(any("재생 화면 닫기")); pause(2)
    tap(starts("파도")); pause(3.5)
    tap(any("더보기")); pause(1.5); shot("dropMenu")
    let rep = app.buttons["신고하기"]
    if rep.waitForExistence(timeout: 3) { rep.tap(); pause(2.5); shot("report") }
    app.terminate(); app.launch(); pause(5)
    tap(dockTab("플리")); pause(2.5)
    tap(containing("새벽 드라이브")); pause(3)
    tap(any("곡 메뉴")); pause(2.5); shot("trackMenu")
    tap(containing("다른 플리에 담기")); pause(2.5); shot("playlistPicker")
  }
}
