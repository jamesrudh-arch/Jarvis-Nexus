'use client';

import type { NexusClient, NexusSnapshot } from '@/nexus/client';

export default function HologramBar({ snap, client }: { snap: NexusSnapshot; client: NexusClient | null }) {
  const layouts: Array<[string, string]> = [
    ['peppers_ghost', "45° Pepper's Ghost Mirror"],
    ['pyramid_4face', '4-Face Pyramid Quad'],
    ['direct_black', 'Direct Optical Black'],
  ];
  return (
    <section id="hologram-control-bar" className="hologram-bar">
      <span>HOLOGRAPHIC OUTPUT:</span>
      {layouts.map(([id, label]) => (
        <button
          key={id}
          className={`btn-chip ${snap.holoLayout === id ? 'active' : ''}`}
          onClick={() => client?.setHoloLayout(id)}
        >
          {label}
        </button>
      ))}
      <button className="btn-chip btn-danger-outline" onClick={() => client?.setMode('living_presence')}>
        Return to Sanctuary View
      </button>
    </section>
  );
}
