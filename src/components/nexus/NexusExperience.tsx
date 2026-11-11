'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import '@/nexus/nexus.css';
import { NexusClient, type NexusSnapshot } from '@/nexus/client';
import BootOverlay from './BootOverlay';
import HudHeader from './HudHeader';
import FirstWakeBanner from './FirstWakeBanner';
import ModesDrawer from './ModesDrawer';
import ScenarioBar from './ScenarioBar';
import HologramBar from './HologramBar';
import InspectorDrawer from './InspectorDrawer';
import DialogueDock from './DialogueDock';

export default function NexusExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const camElRef = useRef<HTMLVideoElement>(null);
  const [client, setClient] = useState<NexusClient | null>(null);
  const [snap, setSnap] = useState<NexusSnapshot | null>(null);
  const [entered, setEntered] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !labelsRef.current) return;
    const nexus = new NexusClient(canvasRef.current, labelsRef.current, camElRef.current, (s) => setSnap(s));
    setClient(nexus);
    // Debug handle for console diagnostics (dev/ops inspection)
    (window as unknown as { __nexusClient?: NexusClient }).__nexusClient = nexus;
    void nexus.bootstrap();
    return () => {
      nexus.dispose();
    };
  }, []);

  const world = snap?.world ?? null;
  const holoActive = world?.active_mode === 'holographic_presence';

  const enterSanctuary = useCallback(() => {
    // User gesture unlocks audio playback for her synthesized voice
    setEntered(true);
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void ctx.resume();
    } catch { /* not critical */ }
  }, []);

  return (
    <div id="viewport-root">
      <canvas id="nexus-canvas" ref={canvasRef} aria-label="JARVIS NEXUS real-time 3D sanctuary" />
      <div id="spatial-labels-layer" aria-hidden="true" ref={labelsRef} />
      <div id="hologram-guides" className={holoActive && snap?.holoLayout === 'pyramid_4face' ? '' : 'hidden'}>
        <div className="holo-crosshair"></div>
        <div className="holo-badge">LIVE HOLOGRAPHIC PROJECTION · SYNCHRONIZED REAL-TIME INSTANCE</div>
      </div>

      {/* Hidden optical camera preview element (only live when CAM switch is ON) */}
      <video id="optical-cam-el" className="hidden" playsInline autoPlay muted ref={camElRef} />

      {entered && snap?.ready !== false && snap && (
        <>
          <HudHeader
            snap={snap}
            client={client}
            onOpenModes={() => setModesOpen((v) => !v)}
            onOpenInspector={() => setInspectorOpen((v) => !v)}
          />
          {world && !world.first_launch_completed && (
            <FirstWakeBanner client={client} />
          )}
          <ModesDrawer
            open={modesOpen}
            snap={snap}
            client={client}
            onClose={() => setModesOpen(false)}
          />
          {snap.activeScenarioDef && world?.active_scenario && (
            <ScenarioBar snap={snap} client={client} />
          )}
          {holoActive && <HologramBar snap={snap} client={client} />}
          <InspectorDrawer
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            client={client}
          />
          <DialogueDock snap={snap} client={client} />
        </>
      )}

      {!entered && (
        <BootOverlay snap={snap} onEnter={enterSanctuary} />
      )}
    </div>
  );
}
