"""Region ownership registry (spec §31, Tier 0: single owner).

Each region (state-level geography node) has exactly one authoritative
simulation owner at any time, backed by a lease that expires by tick.
Transfers are event-sourced and validated against the current owner.
Tier 1/2 notes: with multiple workers, leases gain fencing tokens; the
event-sourced audit trail here is the recovery mechanism (ADR-002).
"""
from __future__ import annotations

from persistence.world_store import WorldStore

DEFAULT_TTL_TICKS = 100_000


class OwnershipError(Exception):
    pass


class RegionRegistry:
    def __init__(self, store: WorldStore):
        self.store = store

    def acquire(self, region_id: str, owner: str,
                ttl_ticks: int = DEFAULT_TTL_TICKS,
                idempotency_key: str | None = None) -> dict:
        applied = self.store.append(self.store.current_tick,
                                    "region.lease_acquired", {
                                        "idempotency_key":
                                            idempotency_key or
                                            f"lease-{region_id}-{owner}",
                                        "region_id": region_id,
                                        "owner": owner,
                                        "ttl_ticks": ttl_ticks})
        return {"region_id": region_id, "owner": owner, "applied": applied}

    def renew(self, region_id: str, owner: str,
              ttl_ticks: int = DEFAULT_TTL_TICKS,
              idempotency_key: str | None = None) -> dict:
        current = self.owner_of(region_id)
        if current != owner:
            raise OwnershipError(
                f"cannot renew {region_id}: owner is {current!r}, not {owner!r}")
        row = self.store.db.execute(
            "SELECT lease_expires_tick FROM regions WHERE region_id=?",
            (region_id,)).fetchone()
        applied = self.store.append(self.store.current_tick,
                                    "region.lease_renewed", {
                                        "idempotency_key": idempotency_key or
                                        f"lease-renew-{region_id}-{row[0]}",
                                        "region_id": region_id,
                                        "owner": owner,
                                        "ttl_ticks": ttl_ticks})
        return {"region_id": region_id, "owner": owner, "applied": applied}

    def transfer(self, region_id: str, from_owner: str, to_owner: str,
                 ttl_ticks: int = DEFAULT_TTL_TICKS,
                 idempotency_key: str | None = None) -> dict:
        current = self.owner_of(region_id)
        if current != from_owner:
            raise OwnershipError(
                f"cannot transfer {region_id}: owner is {current!r}, "
                f"not {from_owner!r}")
        self.store.append(self.store.current_tick,
                          "region.ownership_transferred", {
                              "idempotency_key": idempotency_key or
                              f"transfer-{region_id}-{from_owner}-{to_owner}",
                              "region_id": region_id,
                              "from_owner": from_owner,
                              "to_owner": to_owner,
                              "ttl_ticks": ttl_ticks})
        return {"region_id": region_id, "owner": to_owner}

    def owner_of(self, region_id: str) -> str:
        row = self.store.db.execute(
            "SELECT owner FROM regions WHERE region_id=?",
            (region_id,)).fetchone()
        if not row:
            raise OwnershipError(f"unknown region {region_id}")
        return row["owner"]

    def lease_state(self, region_id: str) -> dict:
        row = self.store.db.execute(
            "SELECT * FROM regions WHERE region_id=?",
            (region_id,)).fetchone()
        if not row:
            raise OwnershipError(f"unknown region {region_id}")
        expired = self.store.current_tick > row["lease_expires_tick"]
        return {"region_id": region_id, "owner": row["owner"],
                "lease_expires_tick": row["lease_expires_tick"],
                "lease_expired": expired}

    def list_regions(self) -> list[dict]:
        out = []
        for r in self.store.regions():
            r["lease_expired"] = (
                self.store.current_tick > r["lease_expires_tick"])
            out.append(r)
        return out
