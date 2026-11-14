/**
 * World clock (spec §32 port): sim time decoupled from wall-clock.
 * tick t ⇔ epoch_utc + t × minutes_per_tick. Deterministic arithmetic only.
 * Day index uses days-since-epoch (JS) instead of Python's proleptic
 * ordinal — a constant offset, so per-day decisions stay deterministic.
 */

export interface ClockMeta {
  epoch_utc: string; // ISO
  minutes_per_tick: number;
}

const NS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export class WorldClock {
  readonly epochMs: number;
  readonly minutesPerTick: number;

  constructor(epochUtc: string, minutesPerTick = 10) {
    this.epochMs = Date.parse(epochUtc);
    this.minutesPerTick = minutesPerTick;
  }

  static fromMeta(meta: ClockMeta): WorldClock {
    return new WorldClock(meta.epoch_utc, meta.minutes_per_tick ?? 10);
  }

  /** UTC instant of a tick, in epoch-ms. */
  timeAtMs(tick: number): number {
    return this.epochMs + tick * this.minutesPerTick * 60_000;
  }

  timeAt(tick: number): Date {
    return new Date(this.timeAtMs(tick));
  }

  /** Local wall-clock parts for a tz offset in hours. */
  localParts(tick: number, tzOffsetHours: number) {
    const ms = this.timeAtMs(tick) + tzOffsetHours * 3_600_000;
    const d = new Date(ms);
    // day-of-week index (Mon=0) for the *local* date
    const dow = (Math.floor(ms / 86_400_000) + 3) % 7; // 1970-01-01 = Thu(3)
    return {
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      dayIndex: dow,
      dayName: NS[dow],
      isWeekday: dow < 5,
      daysSinceEpoch: Math.floor(ms / 86_400_000),
    };
  }

  isDaytime(tick: number, tzOffsetHours: number): boolean {
    const hour = this.localParts(tick, tzOffsetHours).hour;
    return hour >= 6 && hour < 18; // documented simplification (§32)
  }

  season(tick: number, hemisphere: "north" | "south" = "north"): string {
    const month = this.timeAt(tick).getUTCMonth() + 1;
    const north: Record<number, string> = {
      12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring",
      5: "spring", 6: "summer", 7: "summer", 8: "summer", 9: "autumn",
      10: "autumn", 11: "autumn",
    };
    const south: Record<number, string> = {
      12: "summer", 1: "summer", 2: "summer", 3: "autumn", 4: "autumn",
      5: "autumn", 6: "winter", 7: "winter", 8: "winter", 9: "spring",
      10: "spring", 11: "spring",
    };
    return (hemisphere === "south" ? south : north)[month];
  }

  describe(tick: number, tzOffsetHours = 0, hemisphere: "north" | "south" = "north") {
    const p = this.localParts(tick, tzOffsetHours);
    const t = this.timeAt(tick);
    return {
      tick,
      sim_time_utc: t.toISOString().replace(".000Z", "+00:00"),
      local_time: `${p.dayName} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
      local_hour: p.hour,
      day_of_week: p.dayName,
      is_weekday: p.isWeekday,
      is_daytime: this.isDaytime(tick, tzOffsetHours),
      season: this.season(tick, hemisphere),
    };
  }
}
