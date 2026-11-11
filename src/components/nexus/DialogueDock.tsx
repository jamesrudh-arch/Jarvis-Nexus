'use client';

import { useState } from 'react';
import type { NexusClient, NexusSnapshot } from '@/nexus/client';

export default function DialogueDock({ snap, client }: { snap: NexusSnapshot; client: NexusClient | null }) {
  const [input, setInput] = useState('');
  const world = snap.world;
  const hasStack = Boolean(world?.interrupted_task_stack?.length);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    void client?.sendConversation(text, 'text');
  };

  const micLabel =
    snap.micState === 'listening' ? 'LISTENING…'
    : snap.micState === 'processing' ? 'PROCESSING…'
    : world?.switches.microphone ? 'MIC READY'
    : 'MIC OFF';

  const camLabel =
    snap.camState === 'live' ? 'CAM LIVE'
    : world?.switches.camera ? 'CAM READY'
    : 'CAM OFF';

  return (
    <footer id="dialogue-dock">
      {snap.subtitle && (
        <div id="subtitle-ribbon" className="subtitle-ribbon" aria-live="polite">
          <span className="speaker-tag">NEXUS</span>
          <span id="subtitle-text">{snap.subtitle.content}</span>
          <span className="source-pill" id="inference-source-pill">{snap.subtitle.inference_source}</span>
        </div>
      )}

      {snap.error && (
        <div className="subtitle-ribbon" style={{ borderColor: 'var(--red)' }} role="alert">
          <span className="speaker-tag" style={{ color: 'var(--red)' }}>CORE</span>
          <span id="core-error-text">{snap.error}</span>
        </div>
      )}

      <form id="chat-form" className="dialogue-bar" autoComplete="off" onSubmit={submit}>
        <button
          type="button"
          id="btn-mic-ptt"
          className={`dock-btn ${snap.micState === 'listening' ? 'btn-warn' : ''}`}
          title="Voice Input (Requires Microphone Switch ON)"
          onClick={() => {
            if (snap.micState === 'listening') client?.stopVoiceCapture();
            else void client?.startVoiceCapture();
          }}
        >
          <span id="mic-state-label">{micLabel}</span>
        </button>
        <button
          type="button"
          id="btn-cam-snap"
          className="dock-btn"
          title="Optical Vision Snapshot (Requires Camera Switch ON)"
          onClick={() => void client?.visionSnapshot()}
        >
          <span id="cam-state-label">{camLabel}</span>
        </button>
        <input
          type="text"
          id="chat-input"
          placeholder='Speak directly with NEXUS — e.g. "Show me the cryogenic manifold failure in 3D" or "Compare turbine variants"…'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message to NEXUS"
        />
        {snap.interruptAvailable && (
          <button
            type="button"
            id="btn-interrupt"
            className="dock-btn btn-warn"
            title="Interrupt NEXUS mid-speech or mid-motion"
            onClick={() => void client?.interruptSpeech()}
          >
            Interrupt
          </button>
        )}
        {hasStack && (
          <button
            type="button"
            id="btn-resume-task"
            className="dock-btn btn-cyan-outline"
            title="Resume previously interrupted station work"
            onClick={() => void client?.resumeTask()}
          >
            Resume Work
          </button>
        )}
        <button type="submit" className="dock-btn btn-send">Transmit</button>
      </form>
    </footer>
  );
}
