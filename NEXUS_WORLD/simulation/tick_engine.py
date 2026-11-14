"""Tick engine (spec §10, §32): advances simulation time deterministically.

Phase 1 scope: the heartbeat of the world — clock advancement as
world.tick_advanced events with DETERMINISTIC idempotency keys
(tick-{world_id}-{n}), plus automatic region-lease renewal when a lease
approaches expiry. Resident behaviour arrives in Phase 2 on this same loop.
"""
from __future__ import annotations

from infrastructure.event_bus import EventBus
from persistence.world_store import WorldStore
from simulation.region_ownership import RegionRegistry
from simulation.world_clock import WorldClock

RENEW_MARGIN_TICKS = 1440  # renew leases within one simulated day of expiry


class TickEngine:
    def __init__(self, store: WorldStore, bus: EventBus | None = None,
                 behaviour=None):
        """`behaviour` (Phase 2): optional object with .step(tick) — the
        ResidentEngine advances the living population on this same loop.
        Phase 1 worlds pass nothing and are completely unaffected."""
        self.store = store
        self.bus = bus
        self.behaviour = behaviour
        self.clock = WorldClock.from_store({
            "epoch_utc": store.meta("epoch_utc"),
            "minutes_per_tick": store.meta("minutes_per_tick", "10")})
        self.regions = RegionRegistry(store)

    def _publish(self, event: dict) -> None:
        if self.bus:
            self.bus.publish(event)

    def run(self, n_ticks: int) -> dict:
        """Advance n ticks. Re-running after a crash cannot double-apply:
        each tick event's idempotency key is deterministic."""
        world_id = self.store.meta("world_id", "world")
        advanced = 0
        for _ in range(n_ticks):
            next_tick = self.store.current_tick + 1
            sim_time = self.clock.time_at(next_tick).isoformat()
            applied = self.store.append(next_tick, "world.tick_advanced", {
                "idempotency_key": f"tick-{world_id}-{next_tick}",
                "tick": next_tick,
                "sim_time_utc": sim_time})
            if applied:
                advanced += 1
                self._publish({"type": "world.tick_advanced",
                               "tick": next_tick,
                               "sim_time_utc": sim_time})
                self._renew_expiring_leases()
                if self.behaviour is not None:
                    # Phase 2 residents advance on the world's own loop;
                    # event keys are idempotent, so a crash mid-step can
                    # never double-apply on retry.
                    self.behaviour.step(next_tick)
        return {"tick": self.store.current_tick,
                "requested": n_ticks,
                "advanced": advanced,
                "sim_time_utc":
                    self.clock.time_at(self.store.current_tick).isoformat()}

    def _renew_expiring_leases(self) -> None:
        tick = self.store.current_tick
        rows = self.store.db.execute(
            "SELECT region_id,owner,lease_expires_tick FROM regions "
            "ORDER BY region_id").fetchall()
        for r in rows:
            if tick >= r["lease_expires_tick"] - RENEW_MARGIN_TICKS:
                # deterministic key: unique per (region, old expiry)
                self.store.append(tick, "region.lease_renewed", {
                    "idempotency_key":
                        f"lease-renew-{r['region_id']}-{r['lease_expires_tick']}",
                    "region_id": r["region_id"], "owner": r["owner"],
                    "ttl_ticks": 100_000})

    def summary(self) -> dict:
        tick = self.store.current_tick
        return {"world_id": self.store.meta("world_id"),
                "world_name": self.store.meta("world_name"),
                "tick": tick,
                "sim_time_utc":
                    self.clock.time_at(tick).isoformat() if
                    self.store.meta("epoch_utc") else None,
                "geo_counts": self.store.geo_counts_by_level(),
                "regions": len(self.store.regions()),
                "entities": len(self.store.entities()),
                "events": self.store.event_count()}
