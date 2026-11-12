# JARVIS NEXUS — Native iOS App

Implementation status: **code complete, prepared for external execution.**
Building an iOS app requires Xcode on macOS — neither exists in this sandbox.
Every file here is the real Swift implementation; bring-up steps follow.

## Why native iOS beside the PWA

Apple's actual constraints (verified against Apple documentation, not assumed):
- A PWA (home-screen web app) loses its `getUserMedia` microphone stream when
  Safari is backgrounded or the device locks. There is NO PWA API for
  background microphone capture.
- The Speech framework + an `audio` background mode keep wake-word listening
  alive while the app is backgrounded. When the DEVICE LOCKS, iOS suspends
  mic capture for all third-party apps — the app resumes listening on unlock.
  This is reported honestly; no unsupported promise is made.

## Components

| File | Purpose |
|---|---|
| `JarvisNexusApp.swift` | SwiftUI entry; configures the shared audio session |
| `VoiceSession.swift` | AVAudioSession (`.playAndRecord`, `.voiceChat`, `defaultToSpeaker`) + `SFSpeechRecognizer` continuous recognition. Same state machine as the web engine: standby → "Hey JARVIS" → active; sleep phrases return to standby; speech during her reply fires barge-in. Permission states (granted / denied / restricted) surfaced — never faked |
| `NexusWebView.swift` | WKWebView into the deployed sanctuary (NEXUS_URL) + native↔web bridge (`jarvis-utterance` / `jarvis-barge-in` events; `jarvisNative` message handler) |
| `Info.plist` | Permission strings (mic / speech / camera), `audio` background mode, NEXUS_URL |

## Bring-up (exact external execution requirements)

1. A Mac with Xcode 16+ and an Apple Developer account.
2. `mkdir JarvisNexus.xcodeproj` → create a new iOS App target named
   "JarvisNexus", then add these four files to it (SwiftUI lifecycle).
3. Set the deployment target to iOS 17; signing: automatic with your team.
4. Set `NEXUS_URL` in Info.plist to the deployed Railway domain (see
   docs/INTEGRATIONS.md).
5. Run on device (the simulator has no real microphone pipeline).
6. First launch: iOS prompts for Microphone + Speech Recognition with the
   explanations in Info.plist — the wake engine arms only after both are
   granted (denials are shown as `denied`, never bypassed).

## Web-side integration

The web client already dispatches `jarvis-utterance` / `jarvis-barge-in`
events on `window` when running inside the native shell — the same callbacks
the in-page wake engine uses — so both transports share one behaviour
contract.
