"""World clock (spec §32): simulation time decoupled from wall-clock time.

Pure, deterministic arithmetic:
  tick t  ⇔  epoch_utc + t × minutes_per_tick  (UTC instant)
Local time per region derives from the region's country tz_offset_hours.
Day/night and season are derived properties (documented simplifications:
fixed 06:00–18:00 daylight window; meteorological seasons by month).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

SEASONS_NORTH = {12: "winter", 1: "winter", 2: "winter",
                 3: "spring", 4: "spring", 5: "spring",
                 6: "summer", 7: "summer", 8: "summer",
                 9: "autumn", 10: "autumn", 11: "autumn"}
SEASONS_SOUTH = {12: "summer", 1: "summer", 2: "summer",
                 3: "autumn", 4: "autumn", 5: "autumn",
                 6: "winter", 7: "winter", 8: "winter",
                 9: "spring", 10: "spring", 11: "spring"}


@dataclass(frozen=True)
class WorldClock:
    epoch_utc: datetime
    minutes_per_tick: int = 10  # 144 ticks per simulated day

    def time_at(self, tick: int) -> datetime:
        return self.epoch_utc + timedelta(minutes=tick * self.minutes_per_tick)

    def tick_of(self, moment: datetime) -> int:
        delta = moment - self.epoch_utc
        return int(delta.total_seconds() // (self.minutes_per_tick * 60))

    def local_time(self, tick: int, tz_offset_hours: int) -> datetime:
        return self.time_at(tick).replace(
            tzinfo=timezone.utc).astimezone(
            timezone(timedelta(hours=tz_offset_hours)))

    def is_daytime(self, tick: int, tz_offset_hours: int) -> bool:
        hour = self.local_time(tick, tz_offset_hours).hour
        return 6 <= hour < 18  # documented simplification

    def season(self, tick: int, hemisphere: str = "north") -> str:
        month = self.time_at(tick).month
        table = SEASONS_SOUTH if hemisphere == "south" else SEASONS_NORTH
        return table[month]

    def describe(self, tick: int, tz_offset_hours: int = 0,
                 hemisphere: str = "north") -> dict:
        local = self.local_time(tick, tz_offset_hours)
        return {"tick": tick,
                "sim_time_utc": self.time_at(tick).isoformat(),
                "local_time": local.isoformat(),
                "day_of_week": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
                                "Sun"][local.weekday()],
                "is_daytime": self.is_daytime(tick, tz_offset_hours),
                "season": self.season(tick, hemisphere)}

    @staticmethod
    def from_store(meta: dict) -> "WorldClock":
        return WorldClock(
            epoch_utc=datetime.fromisoformat(meta["epoch_utc"]),
            minutes_per_tick=int(meta.get("minutes_per_tick", 10)))
