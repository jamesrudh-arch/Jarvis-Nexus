# NEXUS WORLD — Event & Data Contracts (Phase 1)

The event log is the single source of truth (ADR-002). Every event carries
`idempotency_key` (the event_id) — duplicate delivery is a no-op. Events are
append-only, totally ordered by `seq`, and every projection is rebuildable
by replay. Adding a field is backward-compatible; changing a field's meaning
requires a new event version suffix (spec §30 versioning discipline).

## Event catalogue (implemented Phase 1)

| Type | Key rule | Payload fields | Emitted by |
|---|---|---|---|
| `world.created` | `world-{world_id}` | world_id, name, seed, epoch_utc, minutes_per_tick | API `POST /world/create` |
| `world.tick_advanced` | `tick-{world_id}-{n}` (deterministic — safe to re-send after crash) | tick, sim_time_utc | TickEngine |
| `geo.node_created` | `geo-{node_id}` | node_id, parent_id, level, name, path, meta | geography generator |
| `region.lease_acquired` | `lease-{region_id}-{owner}` | region_id, owner, ttl_ticks | RegionRegistry |
| `region.lease_renewed` | `lease-renew-{region_id}-{old_expiry}` (deterministic per renewal) | region_id, owner, ttl_ticks | RegionRegistry / TickEngine auto-renew |
| `region.ownership_transferred` | `transfer-{region}-{from}-{to}` | region_id, from_owner, to_owner, ttl_ticks | RegionRegistry |
| `entity.registered` | `ent-{entity_id}` | entity_id, entity_type, data | orchestrator capability |
| `command.executed` | command_id (caller-supplied or generated) | actor, action_class, intent, approved, result | CommandOrchestrator |
| `command.rejected` | command_id | actor, action_class, intent, reason | CommandOrchestrator |
| `resident.created` *(reserved, Phase 2)* | `res-{resident_id}` | resident_id, name, location, money_cents, ... | Phase 2 |

## Projections (materialised by the idempotent apply layer)

- `world_meta` — world identity, clock parameters, current_tick
- `geo_nodes` — geography hierarchy (node_id, parent_id, level, name, path, meta)
- `regions` — region_id, owner, lease_expires_tick
- `entity_registry` — entity_id, entity_type, created_tick, data
- `id_counters` — deterministic sequential ID allocation (replayable)
- `command_log` — audit projection of command.executed/rejected

## API contract (Tier 0)

Auth: `X-Nexus-Token` header — founder token grants mutations; no token = read-only observer; invalid token = 401.

| Method/Path | Role | Purpose |
|---|---|---|
| POST /world/create | founder | create world + geography + region leases |
| GET /health | any | liveness + world summary |
| GET /world/state | observer+ | clock, geography counts, regions, entity count |
| GET /world/geography | observer+ | node counts per level |
| GET /world/geography/{node_id} | observer+ | node + children |
| POST /world/tick | founder | advance n ticks (idempotent by deterministic tick keys) |
| GET /world/events?since_seq=&limit= | observer+ | event feed (polling; WebSocket later, same contract) |
| POST /command | founder | orchestrator entry (permission-checked, audited, idempotent) |
| GET /world/commands | observer+ | command audit log |
| GET /world/regions | observer+ | region ownership + lease state |
| POST /world/regions/{id}/transfer | founder | ownership transfer (validated against current owner) |

## Model-provider contract (`models/provider_registry.py`)

`generate(messages, **options) -> {"text", "provider", "model", "usage"}`.
Providers register by name into the central ModelRouter; failure raises
`ProviderError`. Phase 1 ships the contract + deterministic EchoProvider;
real providers attach at Phase 2.

## Phase 2 resident events (Continuation, 2026-11-13)

All idempotent (deterministic keys), all replayable, all applied to
projections by `WorldStore._apply`:

| Event | Key | Payload essentials | Projection effect |
|---|---|---|---|
| `resident.created` | `resident-create-{rid}` | resident_id, data (identity, traits, home/work/venue, initial needs) | entity_registry row (type resident) |
| `resident.acted` | `act-{rid}-{tick}` | resident_id, data (full state snapshot: action, at_building, pos, needs) | entity data UPDATE — snapshots are the persisted truth; movement ticks emit because positions are state |
| `resident.memory_recorded` | `mem-{memory_id}` | memory_id, resident_id, tick, kind, text, importance | memories table row |
| `resident.communication` | `comm-{a}-{b}-{tick//6}` | from_id, to_id, building_id, topic | world-log fact (state effect flows via the two memory events emitted alongside) |
| `world.weather_changed` | `weather-{world}-{day}` | weather (clear/cloudy/rain) | world_meta.weather |

New endpoints (additive; Phase-1 routes untouched — regression 48/48):
`POST /world/populate`, `GET /residents`, `GET /residents/{id}`,
`GET /cognition/status`, `POST /render` (through the orchestrator),
`GET /world/renders`.

Model-provider note: the contract is unchanged; real providers now
attach — Z-AI (glm-4-plus, reachable, default), OpenAI (configured,
edge-geo-blocked — fails honestly), EchoProvider (tests).

## V2 layer events (definitive-directive session, 2026-11-14)

New event types carry `schema_version: 1` in their payload (older events
predate the field — documented, not retro-faked). All idempotent via
deterministic keys; all replayable; projections in `src/lib/nexus/store.ts`
apply layer (TS product) mirroring the Python contract.

| Event | Key | Payload essentials | Projection effect |
|---|---|---|---|
| `jarvis.identity_established` | `jarvis-identity-v1` | identity (versioned profile: persona, principles, communication policy) | world_meta.jarvis_identity — survives restarts, provider-independent |
| `economy.salary_paid` | `salary-{rid}-{day}` | worker, amount, day, business_after (FULL post-event snapshot) | business entity data replaced from snapshot |
| `economy.salary_missed` | `salary-{rid}-{day}` | worker, amount, reason=insufficient_cash, business_after | business snapshot (missed_payrolls++) — real hardship, never hidden |
| `economy.transaction_completed` | `buy-{rid}-{tick}` / `restock-{bid}-{day}-{stock}` | buyer (resident or business), seller, product, qty, unit_price, total, purpose (meal/refreshment/supplies/restock), seller_after, buyer_after? | business entities updated from FULL snapshots; resident wallet rides the same tick's `resident.acted` (atomic, one transaction) |
| `economy.purchase_skipped` | `buy-{rid}-{tick}` / `restock-…` | buyer, business, product, price, reason (insufficient_funds / out_of_stock / seller_out_of_stock) | audit-only (no state change) — negative outcomes are recorded, never suppressed |
| `economy.civic_grant` | `grant-{bid}-{day}` | amount, day, business_after | institution cash/revenue/grants (exogenous municipal flow — no taxation modelled in v1; documented modelling choice) |
| `geo.node_created` (level `room`) | `room-{id}` | parent=building, meta {kind, rx, ry, rw, rd} (fractions of building footprint) | geo_nodes row — CityLayout derives world-rect rooms |
| `geo.node_created` (level `object`) | `furn-{id}` | parent=room, meta {kind, ox, oy} (fractions of room rect) | geo_nodes row — furniture objects inside rooms |
| `entity.registered` (type `business`) | `biz-{business_id}` | entity_type=business, data (kind atelier/kitchen/store/institution, owner, products, cash, thresholds) | business entity row |
| `resident.acted` (wallet init) | `wallet-init-{rid}` | data = full state + wallet | entity update — atomic wallet initialisation on upgraded worlds |
| `resident.acted` (rooms) | `act-{rid}-{tick}` (unchanged) | data now carries wallet + room_id | room occupancy is first-class persisted state |

Conservation laws (verified `scripts/test-v2.ts` A2–A4 from the event log
alone): `wallets_now = wallets_init + Σsalaries − Σresident_purchases` and
`business_cash_now = business_cash_init + Σresident_purchases + Σgrants −
Σsalaries`; combined total changes ONLY by grants (the single exogenous
inflow in v1).

Restock modelled honestly: kitchens buy "wares" (8 @4) which become meals
(production step); stores buy wares (10 @4) which become supplies. Ateliers
produce +4 wares per paid worker-day. JARVIS draws no salary (operator, not
payroll) and eats from a 120 float — both documented modelling choices.

Eating at a shop venue (possible when a resident's nearest venue is a shop)
does not transact in v1 — meals are sold by kitchens only. Recorded here as
a known limitation, not hidden.
