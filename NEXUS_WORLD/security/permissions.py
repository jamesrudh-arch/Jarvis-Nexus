"""Permissions (spec §35–36; JARVIS directive Part 8).

Action classes (ascending consequence) and the Tier 0 policy.
Tier 0 reality: one authorised human (the Founder) and anonymous read-only
observers. The structure (classes, approval gates, audit) is the contract;
Tier 1 adds service-to-service auth on top without changing semantics.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ActionClass(str, Enum):
    OBSERVE = "observe"            # read world state
    INSPECT = "inspect"            # deep read (events, audit, internals)
    INTERACT = "interact"          # converse/touch residents (Phase 2+)
    SIMULATE = "simulate"          # advance ticks, run experiments
    MODIFY_STATE = "modify_state"  # create/alter world entities
    EXTERNAL = "external"          # real-world side effects
    IRREVERSIBLE = "irreversible"  # destructive real-world actions


class Role(str, Enum):
    FOUNDER = "founder"
    OBSERVER = "observer"


# Roles are additive; observers get read-only.
ROLE_PERMISSIONS: dict[Role, set[ActionClass]] = {
    Role.FOUNDER: set(ActionClass),
    Role.OBSERVER: {ActionClass.OBSERVE, ActionClass.INSPECT},
}

# Action classes that ALWAYS require explicit approval confirmation,
# regardless of role (spec §35: "Require appropriate confirmation for
# sensitive or consequential external actions").
APPROVAL_REQUIRED = {ActionClass.EXTERNAL, ActionClass.IRREVERSIBLE}


@dataclass(frozen=True)
class Decision:
    allowed: bool
    approval_required: bool
    reason: str


def check(role: Role, action_class: ActionClass) -> Decision:
    if action_class not in ROLE_PERMISSIONS[role]:
        return Decision(False, False,
                        f"role {role.value} may not perform "
                        f"{action_class.value}")
    approval = action_class in APPROVAL_REQUIRED and role == Role.FOUNDER
    return Decision(True, approval, "ok" if not approval else
                    "founder confirmation required")
