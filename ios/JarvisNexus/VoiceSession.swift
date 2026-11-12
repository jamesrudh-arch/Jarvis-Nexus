// JARVIS NEXUS — on-device voice session: wake word, standby, barge-in.
//
// Why native: iOS grants continuous microphone access only to apps using a
// proper AVAudioSession (playAndRecord + voiceChat) with the
// NSMicrophoneUsageDescription key; a PWA's getUserMedia stream is suspended
// when Safari is backgrounded or the device locks — Apple does not provide
// PWA background microphone APIs. This class implements the SAME behaviour
// contract as the web wake engine (src/nexus/wakeWord.ts):
//
//   standby → "Hey JARVIS" → active → utterances routed to CORE
//   "go to sleep"/"stand by" → standby; voice during speech → barge-in.

import AVFoundation
import Speech

final class VoiceSession: NSObject, ObservableObject, SFSpeechRecognizerDelegate {
    static let shared = VoiceSession()

    enum WakeState { case standby, active, denied }

    @Published var state: WakeState = .standby
    @Published var lastTranscript: String = ""

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()

    private let wakePhrases = ["hey jarvis", "hey jervis", "ok jarvis", "okay jarvis"]
    private let sleepPhrases = ["go to sleep", "stand by", "standby", "that will be all"]

    /// Callback into the web layer (set by NexusWebView).
    var onUtterance: ((String) -> Void)?
    var onBargeIn: (() -> Void)?

    // MARK: - Audio session (the capability a PWA cannot guarantee)

    func configureAudioSession() {
        // voiceChat mode enables echo cancellation + hardware voice processing;
        // defaultToSpeaker keeps her voice audible without headphones.
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat,
                                    options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            NSLog("[JARVIS] audio session error: \(error)")
        }
        requestPermissions()
    }

    private func requestPermissions() {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                switch status {
                case .authorized:
                    self?.state = .standby
                    self?.startListening()
                default:
                    self?.state = .denied  // reported honestly — never faked
                }
            }
        }
    }

    // MARK: - Continuous on-device recognition

    private func startListening() {
        guard task == nil else { return }
        request = SFSpeechAudioBufferRecognitionRequest()
        request?.shouldReportPartialResults = true

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        engine.prepare()
        do { try engine.start() } catch {
            NSLog("[JARVIS] engine start error: \(error)")
            return
        }

        task = recognizer.recognitionTask(with: request!) { [weak self] result, _ in
            guard let self, let result else { return }
            let text = result.bestTranscription.formattedString.lowercased()
            self.handleTranscript(text)
        }
    }

    private func handleTranscript(_ text: String) {
        let clean = text.replacingOccurrences(
            of: "[^a-z0-9 ]", with: " ", options: .regularExpression
        ).trimmingCharacters(in: .whitespaces)

        if state == .standby {
            guard wakePhrases.contains(where: clean.contains) else { return }
            DispatchQueue.main.async {
                self.state = .active
                self.lastTranscript = "…awake"
            }
            return
        }

        // Active: barge-in wins over everything — the web layer cancels speech.
        if onBargeIn != nil && !clean.isEmpty {
            DispatchQueue.main.async { self.onBargeIn?() }
        }

        if sleepPhrases.contains(where: clean.contains) {
            DispatchQueue.main.async {
                self.state = .standby
                self.lastTranscript = "…standby"
            }
            return
        }

        // Final-ish utterance: route non-trivial text to CORE via the bridge.
        if clean.count > 2, clean != lastTranscript {
            DispatchQueue.main.async {
                self.lastTranscript = clean
                self.onUtterance?(clean)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        request?.endAudio()
    }
}
