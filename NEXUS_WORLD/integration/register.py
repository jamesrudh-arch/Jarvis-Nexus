"""Live Integration Register (Integration Directive §5).

Tracks the 15 directive fields per technology plus a lifecycle state
machine:

    DISCOVERED → EVALUATED → APPROVED → INSTALLED → CONNECTED →
    REGISTERED → TESTED → OPERATIONAL

Rules enforced in code:
  * states only ever move forward (no silent regressions);
  * OPERATIONAL requires recorded evidence — "A technology cannot advance
    to OPERATIONAL without successful evidence" (directive §5);
  * intelligent selection (directive §6) is recorded via `decision`
    (PROCEED / DEFER / REJECT) + reason — rejections and deferrals are
    first-class register entries, not omissions.

The register is dual-natured BY DESIGN (documented in ADR-007):
  * `integration/register.json` + `INTEGRATION_REGISTER.md` — durable
    ledger, regenerated from real run results (never hand-claimed);
  * `GET /integrations` + `GET /integrations/health` — the LIVE view of
    what is connected right now in the running process.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, fields

STATES = ["DISCOVERED", "EVALUATED", "APPROVED", "INSTALLED", "CONNECTED",
          "REGISTERED", "TESTED", "OPERATIONAL"]
DECISIONS = ["PROCEED", "DEFER", "REJECT"]

# The 15 directive fields, in the order the directive lists them.
DIRECTIVE_FIELDS = [
    "name", "category", "provider", "repo_url", "purpose",
    "integration_method", "install_status", "connection_status",
    "orchestrator_registration", "operational_test", "security_assessment",
    "licensing", "deployment_location", "limitations", "evidence"]


@dataclass
class IntegrationRecord:
    name: str
    category: str
    provider: str
    repo_url: str
    purpose: str
    integration_method: str = "none"
    install_status: str = "not installed"
    connection_status: str = "never connected"
    orchestrator_registration: str = "not registered"
    operational_test: str = "not tested"
    security_assessment: str = "pending"
    licensing: str = "pending"
    deployment_location: str = "n/a"
    limitations: str = ""
    evidence: str = ""
    state: str = "DISCOVERED"
    decision: str = "PROCEED"
    decision_reason: str = ""

    def __post_init__(self) -> None:
        self.validate()

    def validate(self) -> None:
        if self.state not in STATES:
            raise ValueError(f"unknown state {self.state!r}")
        if self.decision not in DECISIONS:
            raise ValueError(f"unknown decision {self.decision!r}")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "IntegrationRecord":
        valid = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in valid})


class IntegrationRegister:
    """In-memory register with JSON persistence + markdown rendering."""

    def __init__(self) -> None:
        self._records: dict[str, IntegrationRecord] = {}

    # ------------------------------------------------------------- records
    def upsert(self, record: IntegrationRecord) -> IntegrationRecord:
        record.validate()
        self._records[record.name] = record
        return record

    def get(self, name: str) -> IntegrationRecord | None:
        return self._records.get(name)

    def all(self) -> list[IntegrationRecord]:
        return sorted(self._records.values(),
                      key=lambda r: (r.category, r.name))

    def advance(self, name: str, state: str, evidence: str | None = None,
                **updates: str) -> IntegrationRecord:
        """Move a record forward in the lifecycle. Refuses regressions and
        refuses OPERATIONAL without evidence."""
        record = self._records.get(name)
        if record is None:
            raise KeyError(f"unknown integration {name!r}")
        if state not in STATES:
            raise ValueError(f"unknown state {state!r}")
        if STATES.index(state) < STATES.index(record.state):
            raise ValueError(
                f"state regression for {name!r}: {record.state} → {state} "
                f"(regressions must be recorded as limitations, not by "
                f"rewriting history)")
        if state == "OPERATIONAL":
            candidate_evidence = evidence or record.evidence
            if not candidate_evidence or not candidate_evidence.strip():
                raise ValueError(
                    f"{name!r} cannot advance to OPERATIONAL without "
                    f"evidence (directive §5)")
        record.state = state
        if evidence:
            record.evidence = evidence
        for key, value in updates.items():
            if not hasattr(record, key):
                raise KeyError(f"no such field {key!r}")
            setattr(record, key, value)
        record.validate()
        return record

    # ----------------------------------------------------------- rendering
    def to_markdown(self) -> str:
        lines = [
            "# JARVIS NEXUS — Live Integration Register",
            "",
            "Maintained per the Mandatory System-Wide Integration Directive "
            "§5. States: DISCOVERED → EVALUATED → APPROVED → INSTALLED → "
            "CONNECTED → REGISTERED → TESTED → OPERATIONAL. A technology "
            "reaches OPERATIONAL only with recorded evidence. `Decision` "
            "records intelligent selection (§6): PROCEED / DEFER / REJECT.",
            "",
            "## Summary",
            "",
            "| # | Technology | Category | State | Decision | Reason |",
            "|---|---|---|---|---|---|",
        ]
        for i, r in enumerate(self.all(), start=1):
            reason = (r.decision_reason or "—").replace("|", "/")[:120]
            lines.append(f"| {i} | {r.name} | {r.category} | {r.state} | "
                         f"{r.decision} | {reason} |")
        lines += ["", "## Detail records", ""]
        for i, r in enumerate(self.all(), start=1):
            lines.append(f"### {i}. {r.name} — {r.state} "
                         f"(decision: {r.decision})")
            lines.append("")
            for f in DIRECTIVE_FIELDS:
                if f == "name":
                    continue
                value = getattr(r, f) or "—"
                lines.append(f"- **{f.replace('_', ' ')}**: {value}")
            lines.append(f"- **state**: {r.state}")
            lines.append(f"- **decision reason**: "
                         f"{r.decision_reason or '—'}")
            lines.append("")
        return "\n".join(lines) + "\n"

    # ---------------------------------------------------------- persistence
    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        payload = {"records": [r.to_dict() for r in self.all()]}
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)

    @classmethod
    def load(cls, path: str) -> "IntegrationRegister":
        register = cls()
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                payload = json.load(fh)
            for item in payload.get("records", []):
                register.upsert(IntegrationRecord.from_dict(item))
        return register
