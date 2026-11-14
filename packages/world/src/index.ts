/**
 * @nexus/world — NEXUS WORLD persistent civilisation architecture.
 */
export * from "./entities";
export * from "./persistence";
export * from "./economy";
export * from "./life";
export * from "./simulation";
export * from "./creation";

import { NexusDb } from "@nexus/db";
import { WorldStore } from "./persistence";
import { SimulationEngine } from "./simulation";
import { EconomyEngine } from "./economy";
import { CreationEngine } from "./creation";
import { LifeEngine } from "./life";

/** Convenience bundle for wiring (apps/nexus-api). */
export class WorldRuntime {
  readonly store: WorldStore;
  readonly simulation: SimulationEngine;
  readonly economy: EconomyEngine;
  readonly life: LifeEngine;
  readonly creation: CreationEngine;

  constructor(db: NexusDb) {
    this.store = new WorldStore(db);
    this.simulation = new SimulationEngine(this.store);
    this.economy = this.simulation.economy;
    this.life = this.simulation.life;
    this.creation = new CreationEngine(this.store);
  }
}
