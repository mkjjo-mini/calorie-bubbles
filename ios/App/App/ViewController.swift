import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        // iOS WebView 오버스크롤 바운스 제거 — 상단 흰 여백 방지
        webView?.scrollView.bounces = false
    }
}
