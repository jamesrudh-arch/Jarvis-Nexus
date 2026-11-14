"""Phase 2 — living residents: identity, needs, schedules, movement,
memory, communication and (pluggable) LLM cognition on the tested
event-sourced core (ADR-003 hierarchical cognition: deterministic utility
layer always; hosted-LLM narrative layer only when a provider is
configured and reachable)."""
from residents.cognition import NullCognition, ResidentCognition
from residents.engine import ACTIONS, NEEDS, ResidentEngine

__all__ = ["ACTIONS", "NEEDS", "ResidentEngine", "ResidentCognition",
           "NullCognition"]
