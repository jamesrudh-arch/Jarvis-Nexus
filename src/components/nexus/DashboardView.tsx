"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useWorld, useTickWorld, useProviders } from "@/hooks/useNexus";
import {
  Sun, Moon, CloudRain, Cloud, Users, Building2, Zap, Brain,
  MessagesSquare, Clock, Play, Pause, Plus, Loader2, ArrowRight, Coins, Sparkles,
} from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  sleeping: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20",
  eating: "text-yellow-300 bg-yellow-500/10 border-yellow-500/20",
  working: "text-orange-300 bg-orange-500/10 border-orange-500/20",
  socializing: "text-pink-300 bg-pink-500/10 border-pink-500/20",
  leisure: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  commuting: "text-zinc-300 bg-zinc-500/10 border-zinc-500/20",
  idle: "text-zinc-400 bg-zinc-800/40 border-zinc-700/40",
};

function WeatherIcon({ weather, daytime }: { weather: string; daytime: boolean }) {
  if (weather === "rain") return <CloudRain className="h-4 w-4" />;
  if (weather === "cloudy") return <Cloud className="h-4 w-4" />;
  return daytime ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />;
}

export function DashboardView({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { data: world, isLoading } = useWorld(4000);
  const { data: providers } = useProviders();
  const tick = useTickWorld();

  const status = (s: string) =>
    s === "operational"
      ? "bg-emerald-500"
      : s === "degraded"
        ? "bg-amber-400"
        : s === "blocked"
          ? "bg-red-500"
          : "bg-zinc-500";

  const stats = [
    {
      label: "Simulation",
      value: world ? `tick ${world.tick.toLocaleString()}` : "—",
      sub: world ? `${world.clock.local_time} · ${world.clock.season} · ${world.clock.day_of_week}` : "",
      icon: Clock,
    },
    {
      label: "Population",
      value: world?.population ?? "—",
      sub: world ? `${world.buildings} buildings · ${world.districts} districts` : "",
      icon: Users,
    },
    {
      label: "Living memory",
      value: world?.memories?.toLocaleString() ?? "—",
      sub: world ? `${world.communications} conversations met` : "",
      icon: Brain,
    },
    {
      label: "Event log",
      value: world?.events?.toLocaleString() ?? "—",
      sub: "idempotent · replayable",
      icon: Zap,
    },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">World overview</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Live state of {world?.world_name ?? "the world"} — every number on this page comes from the event-sourced store.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={tick.isPending}
            onClick={() => tick.mutate({ ticks: 6 })}
          >
            {tick.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            1 hour
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={tick.isPending}
            onClick={() => tick.mutate({ ticks: 144 })}
          >
            {tick.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            1 day
          </Button>
          <Button size="sm" onClick={() => onNavigate("world")}>
            Enter world <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="bg-zinc-900/40 border-zinc-800/80">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{s.label}</span>
                  <Icon className="h-4 w-4 text-zinc-600" />
                </div>
                <div className="text-2xl font-semibold mt-1.5 font-mono tracking-tight">{s.value}</div>
                <div className="text-[11px] text-zinc-500 mt-1">{s.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* population activity */}
        <Card className="bg-zinc-900/40 border-zinc-800/80 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-500" /> Population activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              Object.entries(world?.action_distribution ?? {}).map(([action, n]) => {
                const pct = world ? (n / world.population) * 100 : 0;
                return (
                  <div key={action} className="flex items-center gap-3">
                    <span className={`text-xs border rounded-md px-2 py-0.5 w-24 text-center ${ACTION_COLORS[action] ?? ACTION_COLORS.idle}`}>
                      {action}
                    </span>
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-zinc-400 font-mono w-8 text-right">{n}</span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* environment + providers */}
        <div className="space-y-4">
          <Card className="bg-zinc-900/40 border-zinc-800/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Local time</span>
                <span className="font-mono">{world?.clock.local_time ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">UTC sim time</span>
                <span className="font-mono text-xs">{world?.clock.sim_time_utc?.slice(0, 16) ?? "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Weather</span>
                <span className="flex items-center gap-1.5 font-mono capitalize">
                  <WeatherIcon weather={world?.weather ?? "clear"} daytime={world?.clock.is_daytime ?? true} />
                  {world?.weather ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Daylight</span>
                <span className="font-mono">{world?.clock.is_daytime ? "day" : "night"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Provider health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(providers?.probes ?? []).map((p) => (
                <button
                  key={p.name}
                  onClick={() => onNavigate("providers")}
                  className="w-full flex items-center justify-between text-sm hover:opacity-80 transition-opacity"
                >
                  <span className="flex items-center gap-2 text-zinc-300">
                    <span className={`h-2 w-2 rounded-full ${status(p.status)}`} />
                    {p.name}
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {p.latency_ms != null ? `${p.latency_ms}ms` : p.status}
                  </span>
                </button>
              ))}
              {!providers && <Skeleton className="h-16 w-full" />}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* economy + JARVIS presence */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="bg-zinc-900/40 border-zinc-800/80 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Coins className="h-4 w-4 text-zinc-500" /> Economy — real transactions, event-logged
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !world?.economy ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">businesses</div>
                    <div className="font-mono text-lg">{world.economy.businesses}</div>
                    <div className="text-zinc-600">
                      {Object.entries(world.economy.by_kind).map(([k, n]) => `${n} ${k}`).join(" · ")}
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">transactions</div>
                    <div className="font-mono text-lg">{world.economy.transactions}</div>
                    <div className="text-zinc-600">{world.economy.purchases_skipped} skipped (honest)</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">salaries</div>
                    <div className="font-mono text-lg">{world.economy.salaries_paid}</div>
                    <div className="text-zinc-600">{world.economy.salaries_missed} missed (real hardship)</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">money in circulation</div>
                    <div className="font-mono text-lg">{Math.round(world.economy.business_cash_total + world.economy.wallets_total)}</div>
                    <div className="text-zinc-600">till + wallets</div>
                  </div>
                </div>
                <div className="max-h-32 overflow-y-auto rounded-md border border-zinc-800/60 divide-y divide-zinc-800/50 font-mono text-xs">
                  {world.economy.recent_transactions.length === 0 && (
                    <div className="px-3 py-2 text-zinc-600">no transactions yet — advance the world clock</div>
                  )}
                  {world.economy.recent_transactions.map((t, i) => (
                    <div key={i} className="flex gap-3 px-3 py-1.5 items-baseline">
                      <span className="text-zinc-600 w-12 shrink-0">t{t.tick}</span>
                      <span className="text-amber-300 w-24 shrink-0">{t.purpose}</span>
                      <span className="text-zinc-400 truncate">
                        {typeof t.buyer === "object" && t.buyer !== null
                          ? String((t.buyer as Record<string, unknown>).name ?? "")
                          : String(t.buyer ?? "")}
                        {" → "}
                        {t.product} · {t.total}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" /> JARVIS — resident operator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading || !world?.jarvis ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-500">identity</span>
                  <span className="font-mono text-cyan-300">v{world.jarvis.identity_version ?? "—"} · persistent</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">currently</span>
                  <span className="font-mono text-xs">{world.jarvis.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">location</span>
                  <span className="font-mono text-xs max-w-[55%] text-right truncate">
                    {world.jarvis.at_building}
                    {world.jarvis.room ? ` · ${world.jarvis.room}` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">wallet</span>
                  <span className="font-mono text-xs">{world.jarvis.wallet ?? "—"} (no salary — operator)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">interiors</span>
                  <span className="font-mono text-xs">
                    {world.interiors ? `${world.interiors.rooms} rooms · ${world.interiors.objects} objects` : "—"}
                  </span>
                </div>
                <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => onNavigate("chat")}>
                  Talk to her <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* economy + JARVIS presence */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="bg-zinc-900/40 border-zinc-800/80 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Coins className="h-4 w-4 text-zinc-500" /> Economy — real transactions, event-logged
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !world?.economy ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">businesses</div>
                    <div className="font-mono text-lg">{world.economy.businesses}</div>
                    <div className="text-zinc-600">
                      {Object.entries(world.economy.by_kind).map(([k, n]) => `${n} ${k}`).join(" · ")}
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">transactions</div>
                    <div className="font-mono text-lg">{world.economy.transactions}</div>
                    <div className="text-zinc-600">{world.economy.purchases_skipped} skipped (honest)</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">salaries</div>
                    <div className="font-mono text-lg">{world.economy.salaries_paid}</div>
                    <div className="text-zinc-600">{world.economy.salaries_missed} missed (real hardship)</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded-md px-2.5 py-2 border border-zinc-800/60">
                    <div className="text-zinc-500">money in circulation</div>
                    <div className="font-mono text-lg">{Math.round(world.economy.business_cash_total + world.economy.wallets_total)}</div>
                    <div className="text-zinc-600">till + wallets</div>
                  </div>
                </div>
                <div className="max-h-32 overflow-y-auto rounded-md border border-zinc-800/60 divide-y divide-zinc-800/50 font-mono text-xs">
                  {world.economy.recent_transactions.length === 0 && (
                    <div className="px-3 py-2 text-zinc-600">no transactions yet — advance the world clock</div>
                  )}
                  {world.economy.recent_transactions.map((t, i) => (
                    <div key={i} className="flex gap-3 px-3 py-1.5 items-baseline">
                      <span className="text-zinc-600 w-12 shrink-0">t{t.tick}</span>
                      <span className="text-amber-300 w-24 shrink-0">{t.purpose}</span>
                      <span className="text-zinc-400 truncate">
                        {typeof t.buyer === "object" && t.buyer !== null
                          ? String((t.buyer as Record<string, unknown>).name ?? "")
                          : String(t.buyer ?? "")}
                        {" → "}
                        {t.product} · {t.total}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" /> JARVIS — resident operator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading || !world?.jarvis ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-500">identity</span>
                  <span className="font-mono text-cyan-300">v{world.jarvis.identity_version ?? "—"} · persistent</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">currently</span>
                  <span className="font-mono text-xs">{world.jarvis.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">location</span>
                  <span className="font-mono text-xs max-w-[55%] text-right truncate">
                    {world.jarvis.at_building}
                    {world.jarvis.room ? ` · ${world.jarvis.room}` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">wallet</span>
                  <span className="font-mono text-xs">{world.jarvis.wallet ?? "—"} (no salary — operator)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">interiors</span>
                  <span className="font-mono text-xs">
                    {world.interiors ? `${world.interiors.rooms} rooms · ${world.interiors.objects} objects` : "—"}
                  </span>
                </div>
                <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => onNavigate("chat")}>
                  Talk to her <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* recent events */}
      <Card className="bg-zinc-900/40 border-zinc-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-zinc-500" /> World event stream
            <span className="text-[10px] font-mono text-zinc-600">last 30 events</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-800/60 divide-y divide-zinc-800/50 font-mono text-xs">
            {(world?.recent_events ?? []).map((e) => (
              <div key={e.seq} className="flex gap-3 px-3 py-2 items-baseline">
                <span className="text-zinc-600 w-14 shrink-0">t{e.tick}</span>
                <span
                  className={`w-56 shrink-0 truncate ${
                    e.type === "resident.communication"
                      ? "text-pink-300"
                      : e.type === "world.weather_changed"
                        ? "text-cyan-300"
                        : e.type === "resident.memory_recorded"
                          ? "text-emerald-300"
                          : e.type.startsWith("economy.")
                            ? "text-amber-300"
                            : "text-zinc-400"
                  }`}
                >
                  {e.type}
                </span>
                <span className="text-zinc-500 truncate">
                  {e.topic ?? e.weather ?? e.resident_id ?? ""}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-zinc-600 text-center pb-4">
        JARVIS NEXUS · event-sourced deterministic simulation · provider statuses are live probes, never fabricated
      </p>
    </div>
  );
}
