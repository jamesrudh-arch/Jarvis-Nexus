// JARVIS NEXUS — native iOS companion app (SwiftUI).
// Implements what a PWA cannot do on iOS: on-device wake-word recognition,
// audio-session-protected voice interaction, and a persistent web view into
// the deployed 3D sanctuary. See ios/README.md for Xcode bring-up.

import SwiftUI

@main
struct JarvisNexusApp: App {
    @StateObject private var voice = VoiceSession.shared

    var body: some Scene {
        WindowGroup {
            NexusWebView(voice: voice)
                .onAppear { voice.configureAudioSession() }
        }
    }
}
