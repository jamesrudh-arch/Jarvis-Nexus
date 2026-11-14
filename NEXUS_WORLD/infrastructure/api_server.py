"""World API gateway (Tier 0: FastAPI, per JARVIS NEXUS established
architecture and NEXUS WORLD MASTER_ARCHITECTURE §2).

Auth model: X-Nexus-Token header.
- correct founder token → Role.FOUNDER (mutations allowed)
- no token → Role.OBSERVER (read-only)
- wrong token → 401

Real-time: Phase 1 exposes the polling event feed (GET /world/events).
WebSocket transport lands later against the SAME event contract.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.testclient import TestClient  # noqa: F401 — re-export for tests
from pydantic import BaseModel, Field

from geography.hierarchy import generate_world_geography, region_nodes
from infrastructure.event_bus import EventBus
from models.provider_registry import ModelRouter
from orchestration.command import CommandOrchestrator
from persistence.world_store import WorldStore
from security.permissions import ActionClass, Role
from simulation.region_ownership import OwnershipError, RegionRegistry
from simulation.tick_engine import TickEngine

DEFAULT_FOUNDER_TOKEN = "nexus-tier0-dev-token"  # override via env in prod tiers


class CreateWorldRequest(BaseModel):
    name: str = "Nexus Prime"
    seed: int = 20261113
    minutes_per_tick: int = Field(default=10, ge=1, le=1440)
    epoch_utc: str = "2026-01-01T00:00:00"


class TickRequest(BaseModel):
    n: int = Field(default=1, ge=1, le=10000)


class CommandRequest(BaseModel):
    capability: str
    action_class: str = "simulate"
    params: dict = {}
    command_id: str | None = None
    approved: bool = False


class TransferRequest(BaseModel):
    to_owner: str
    from_owner: str


class PopulateRequest(BaseModel):
    n: int = Field(default=24, ge=1, le=200)


def create_app(db_path: str,
               founder_token: str | None = None) -> FastAPI:
    token = founder_token or os.environ.get(
        "NEXUS_FOUNDER_TOKEN", DEFAULT_FOUNDER_TOKEN)
    app = FastAPI(title="NEXUS WORLD API", version="1.0.0-phase1")
    state: dict = {}  # per-process singletons over the shared DB file

    def store() -> WorldStore:
        if "store" not in state:
            state["store"] = WorldStore(db_path)
        return state["store"]

    def engine() -> TickEngine:
        if "engine" not in state:
            state["engine"] = TickEngine(store(), bus(),
                                          _ResidentBehaviourBridge())
        return state["engine"]

    class _ResidentBehaviourBridge:
        """Phase 2: attaches the resident engine to the tick loop lazily
        — built on the first stepped tick AFTER a population exists, so
        Phase 1 worlds (no residents) are completely unaffected."""

        def __init__(self):
            self.engine = None

        def step(self, tick: int):
            if self.engine is None:
                if not store().entities("resident"):
                    return
                from geography.spatial import CityLayout
                from residents.engine import ResidentEngine
                self.engine = ResidentEngine(
                    store(), CityLayout(store()), cognition_layer())
            self.engine.step(tick)

    def cognition():
        """ModelRouter with the providers actually reachable/configured.
        z-ai (GLM) is the Tier-0 reachable hosted path; OpenAI registers
        when a key is configured and fails honestly if the endpoint is
        unreachable (geo-block). EchoProvider only when nothing else."""
        if "cognition" not in state:
            from models.openai_provider import OpenAIProvider
            from models.provider_registry import EchoProvider, ModelRouter
            from models.zai_provider import ZAIProvider
            router = ModelRouter()
            zai = ZAIProvider()
            if zai._which():
                router.register(zai, default=True)
            if os.environ.get("OPENAI_API_KEY"):
                router.register(OpenAIProvider())
            if router.default is None:
                router.register(EchoProvider(), default=True)
            state["cognition"] = router
        return state["cognition"]

    def cognition_layer():
        """ResidentCognition over the router — None (deterministic only)
        when no real provider is reachable."""
        router = cognition()
        if router.default == "echo":
            return None
        from residents.cognition import ResidentCognition
        return ResidentCognition(router)

    def bus() -> EventBus:
        if "bus" not in state:
            state["bus"] = EventBus()
        return state["bus"]

    def orchestrator() -> CommandOrchestrator:
        if "orch" not in state:
            state["orch"] = CommandOrchestrator(store())
        return state["orch"]

    def role_for(x_nexus_token: str | None) -> Role:
        if x_nexus_token is None:
            return Role.OBSERVER
        if x_nexus_token != token:
            raise HTTPException(401, "invalid token")
        return Role.FOUNDER

    def require_founder(x_nexus_token: str | None) -> Role:
        role = role_for(x_nexus_token)
        if role != Role.FOUNDER:
            raise HTTPException(403, "founder role required")
        return role

    # ---------------------------------------------------------------- world
    @app.post("/world/create", status_code=201)
    def create_world(req: CreateWorldRequest,
                     x_nexus_token: str | None = Header(default=None)):
        require_founder(x_nexus_token)
        s = store()
        if s.meta("world_id"):
            raise HTTPException(409, "world already exists")
        s.append(0, "world.created", {
            "idempotency_key": f"world-{req.name.lower().replace(' ', '-')}",
            "world_id": req.name.lower().replace(" ", "-"),
            "name": req.name, "seed": req.seed,
            "epoch_utc": req.epoch_utc,
            "minutes_per_tick": req.minutes_per_tick})
        geo = generate_world_geography(s, seed=req.seed, world_name=req.name)
        reg = RegionRegistry(s)
        for r in region_nodes(s):
            reg.acquire(r["region_id"], owner="sim-engine-0")
        return {"world_id": s.meta("world_id"), "geography": geo["counts"],
                "regions": len(s.regions())}

    @app.get("/health")
    def health():
        s = store()
        has_world = bool(s.meta("world_id"))
        return {"status": "ok", "world_created": has_world,
                "world_id": s.meta("world_id"),
                "tick": s.current_tick,
                "events": s.event_count()}

    @app.get("/world/state")
    def world_state(x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)  # observers allowed
        s = store()
        if not s.meta("world_id"):
            raise HTTPException(404, "no world; POST /world/create first")
        eng = engine()
        clock = eng.clock
        tick = s.current_tick
        return {"world_id": s.meta("world_id"),
                "world_name": s.meta("world_name"),
                "tick": tick,
                "clock": clock.describe(tick),
                "geo_counts": s.geo_counts_by_level(),
                "regions": RegionRegistry(s).list_regions(),
                "entities": len(s.entities()),
                "events": s.event_count(),
                "bus": bus().stats()}

    # ---------------------------------------------------------------- geography
    @app.get("/world/geography")
    def geography_levels(x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        return {"levels": store().geo_counts_by_level()}

    @app.get("/world/geography/{node_id}")
    def geography_node(node_id: str,
                       x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        s = store()
        node = s.geo_node(node_id)
        if not node:
            raise HTTPException(404, "unknown node")
        return {"node": node, "children": s.geo_children(node_id)}

    # ---------------------------------------------------------------- time
    @app.post("/world/tick")
    def advance_ticks(req: TickRequest,
                      x_nexus_token: str | None = Header(default=None)):
        require_founder(x_nexus_token)
        if not store().meta("world_id"):
            raise HTTPException(404, "no world")
        return engine().run(req.n)

    # ---------------------------------------------------------------- events
    @app.get("/world/events")
    def event_feed(since_seq: int = Query(default=0, ge=0),
                   limit: int = Query(default=100, ge=1, le=1000),
                   x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        return {"events": store().events(since_seq, limit)}

    # ---------------------------------------------------------------- command
    @app.post("/command")
    def command(req: CommandRequest,
                x_nexus_token: str | None = Header(default=None)):
        role = require_founder(x_nexus_token)
        try:
            action_class = ActionClass(req.action_class)
        except ValueError:
            raise HTTPException(400, f"unknown action_class "
                                     f"{req.action_class!r}")
        result = orchestrator().execute(
            actor="founder", role=role, action_class=action_class,
            capability=req.capability, params=req.params,
            command_id=req.command_id, approved=req.approved)
        if result["status"] == "rejected":
            raise HTTPException(403, result["detail"])
        return result

    @app.get("/world/commands")
    def commands(x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        return {"commands": store().commands()}

    # ---------------------------------------------------------------- regions
    @app.get("/world/regions")
    def list_regions(x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        return {"regions": RegionRegistry(store()).list_regions()}

    @app.post("/world/regions/{region_id}/transfer")
    def transfer_region(region_id: str, req: TransferRequest,
                        x_nexus_token: str | None = Header(default=None)):
        require_founder(x_nexus_token)
        try:
            return RegionRegistry(store()).transfer(
                region_id, req.from_owner, req.to_owner)
        except OwnershipError as e:
            raise HTTPException(409, str(e))

    # -------------------------------------------------- residents (Phase 2)
    @app.post("/world/populate", status_code=201)
    def populate(req: PopulateRequest,
                 x_nexus_token: str | None = Header(default=None)):
        require_founder(x_nexus_token)
        s = store()
        if not s.meta("world_id"):
            raise HTTPException(404, "no world; POST /world/create first")
        if s.entities("resident"):
            raise HTTPException(409, "population already exists")
        from geography.spatial import CityLayout
        from residents.engine import ResidentEngine
        eng = ResidentEngine(s, CityLayout(s), cognition_layer())
        result = eng.create_population(req.n)
        return {"world_id": s.meta("world_id"),
                "created": result["created"],
                "resident_ids": result["resident_ids"]}

    @app.get("/residents")
    def list_residents(x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        s = store()
        rows = [{"resident_id": e["entity_id"],
                 "name": e["data"].get("name"),
                 "role": e["data"].get("role"),
                 "action": e["data"].get("action"),
                 "at_building": e["data"].get("at_building"),
                 "needs": e["data"].get("needs", {})}
                for e in s.entities("resident")]
        return {"count": len(rows), "residents": rows}

    @app.get("/residents/{resident_id}")
    def resident_detail(resident_id: str,
                        x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        s = store()
        row = next((e for e in s.entities("resident")
                    if e["entity_id"] == resident_id), None)
        if row is None:
            raise HTTPException(404, "unknown resident")
        return {"resident_id": row["entity_id"],
                "created_tick": row["created_tick"],
                "data": row["data"],
                "memories": s.memories(resident_id, limit=10)}

    # --------------------- long-term memory + autonomy (PRIORITY 5)
    @app.get("/residents/{resident_id}/mind")
    def resident_mind(resident_id: str,
                      x_nexus_token: str | None = Header(default=None)):
        """Salience-ranked long-term memory, autobiography, friendships,
        active goal and mood — the full inner life, all event-derived."""
        role_for(x_nexus_token)
        s = store()
        row = next((e for e in s.entities("resident")
                    if e["entity_id"] == resident_id), None)
        if row is None:
            raise HTTPException(404, "unknown resident")
        from residents.autonomy import active_goal, goal_progress, mood
        from residents.memory import LongTermMemory
        ltm = LongTermMemory(s)
        tick = s.current_tick
        seed = int(s.meta("seed", "0") or 0)
        goal = active_goal(seed, resident_id, tick)
        mems = ltm.memories(resident_id, tick=tick, limit=8)
        return {
            "resident_id": resident_id,
            "name": row["data"].get("name"),
            "autobiography": ltm.autobiography(resident_id, row["data"],
                                               tick),
            "long_term_memory": mems,
            "friends": ltm.friends(resident_id, tick),
            "acquaintances": len(ltm.relationships(tick).get(resident_id,
                                                            [])),
            "mood": mood(row["data"], mems),
            "active_goal": {
                **goal,
                "progress": goal_progress(goal, resident_id, s, ltm, tick)},
            "llm_decisions": row["data"].get("llm_decisions", 0)}

    @app.get("/autonomy/report")
    def autonomy_report(x_nexus_token: str | None = Header(default=None)):
        """The honest autonomy audit for the CURRENT process run:
        decision sources (script/policy/llm), divergence from the pure
        utility script, action entropy, relationship graph stats."""
        role_for(x_nexus_token)
        # the ResidentEngine is created lazily by the behaviour bridge on
        # the first stepped tick after a population exists
        bridge = engine().behaviour
        eng = getattr(bridge, "engine", None)
        if eng is None:
            raise HTTPException(404, "no population; POST /world/populate "
                                     "first, then advance ticks")
        return eng.autonomy_report()

    @app.get("/cognition/status")
    def cognition_status(x_nexus_token: str | None = Header(default=None)):
        role_for(x_nexus_token)
        router = cognition()
        providers = {}
        from models.openai_provider import OpenAIProvider
        from models.zai_provider import ZAIProvider
        for name in router.list_providers():
            # reach the concrete provider object through a probe route
            providers[name] = "registered"
        zai = next((p for p in (router._providers.get("zai"),) if p), None)
        openai = router._providers.get("openai")
        return {
            "default": router.default,
            "providers": router.list_providers(),
            "zai": zai.status() if isinstance(zai, ZAIProvider) else None,
            "openai": openai.probe() if isinstance(openai, OpenAIProvider)
            else None,
            "routed_calls": len(router.route_log)}

    # -------------------------------------------- integrations (additive)
    # System-Wide Integration Directive: /metrics, /integrations,
    # /integrations/health — lazy bundle, zero changes to Phase-1 routes.
    from integration.wiring import integration_routes  # noqa: E402
    integration_routes(app, state, store, token)

    return app
