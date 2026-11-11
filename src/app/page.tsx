import NexusExperience from '@/components/nexus/NexusExperience';

/**
 * JARVIS NEXUS — Embodied Spatial Sanctuary.
 * The experience is a client component; all WebGL/window access happens
 * inside effects, so server prerendering passes through cleanly.
 */
export default function Home() {
  return <NexusExperience />;
}
