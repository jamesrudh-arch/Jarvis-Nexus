// JARVIS NEXUS — WKWebView shell into the deployed 3D sanctuary + the
// native↔web message bridge. Set NEXUS_URL (Info.plist) to the Railway
// deployment domain.

import SwiftUI
import WebKit

struct NexusWebView: UIViewRepresentable {
    @ObservedObject var voice: VoiceSession

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Native → web: utterances + barge-in arrive as window events; the
        // web client picks them up (same contract as wakeWord.ts callbacks).
        let controller = config.userContentController
        controller.add(context.coordinator, name: "jarvisNative")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.008, green: 0.027, blue: 0.043, alpha: 1)

        let nexusURL = Bundle.main.object(forInfoDictionaryKey: "NEXUS_URL") as? String
            ?? "http://localhost:3000"
        webView.load(URLRequest(url: URL(string: nexusURL)!))
        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(voice: voice) }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let voice: VoiceSession
        weak var webView: WKWebView?

        init(voice: VoiceSession) {
            self.voice = voice
            super.init()
            bridgeVoice()
        }

        private func bridgeVoice() {
            voice.onUtterance = { [weak self] text in
                self?.webView?.evaluateJavaScript(
                    "window.dispatchEvent(new CustomEvent('jarvis-utterance',{detail:\(jsEscaped(text))}))", nil)
            }
            voice.onBargeIn = { [weak self] in
                self?.webView?.evaluateJavaScript(
                    "window.dispatchEvent(new Event('jarvis-barge-in'))", nil)
            }
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            // Web → native surface (e.g. 'speak-start'/'speak-end' for
            // audio-session ducking while she talks).
            guard let body = message.body as? [String: Any] else { return }
            NSLog("[JARVIS] web→native: \(body)")
        }

        private func jsEscaped(_ s: String) -> String {
            let data = try! JSONSerialization.data(withJSONObject: [s])
            return String(data: data.dropFirst().dropLast(), encoding: .utf8) ?? "''"
        }
    }
}
