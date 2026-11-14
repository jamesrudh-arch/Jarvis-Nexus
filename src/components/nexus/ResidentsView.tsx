"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useResidents, useResidentDetail } from "@/hooks/useNexus";
import { X, MapPin, Target, Heart } from "lucide-react";

const ACTION_STYLE: Record<string, string> = {
  sleeping: "border-indigo-500/40 text-indigo-300",
  eating: "border-yellow-500/40 text-yellow-300",
  working: "border-orange-500/40 text-orange-300",
  socializing: "border-pink-500/40 text-pink-300",
  leisure: "border-emerald-500/40 text-emerald-300",
  commuting: "border-zinc-500/40 text-zinc-300",
  idle: "border-zinc-700 text-zinc-400",
};

function moodColor(m: number) {
  if (m > 0.15) return "text-emerald-400";
  if (m < -0.15) return "text-red-400";
  return "text-zinc-400";
}

export function ResidentsView() {
  const { data, isLoading } = useResidents(6000);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useResidentDetail(selected);
  const residents = data?.residents ?? [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Residents</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {residents.length} individuals with deterministic goals, derived moods, salience-ranked memories and an
          evolving social graph — all rebuilt from the event log.
        </p>
      </header>

      <div className={selected ? "lg:grid lg:grid-cols-[1fr_360px] lg:gap-5" : ""}>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
          {residents.map((r) => (
            <button
              key={r.resident_id}
              onClick={() => setSelected(r.resident_id === selected ? null : r.resident_id)}
              className={`text-left rounded-xl border p-4 bg-zinc-900/40 transition-colors hover:bg-zinc-900/70 ${
                selected === r.resident_id ? "border-emerald-600/60" : "border-zinc-800/80"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">
                  {r.name}
                  {r.is_jarvis && <span className="text-cyan-300"> ✦</span>}
                </span>
                <Badge variant="outline" className={`${ACTION_STYLE[r.action] ?? ACTION_STYLE.idle} ${r.is_jarvis ? "border-cyan-600/60" : ""}`}>
                  {r.is_jarvis ? "operator" : r.action}
                </Badge>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {r.at_building_name} · {r.district}
                {r.room_name ? <span className="text-zinc-600">· {r.room_name}</span> : null}
              </div>
              {typeof r.wallet === "number" && (
                <div className="text-[11px] text-zinc-600 font-mono mt-1">
                  wallet {Math.round(r.wallet)}
                </div>
              )}
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {Object.entries(r.needs).map(([k, v]) => (
                  <div key={k} title={`${k}: ${Math.round(v)}`}>
                    <div className="text-[9px] uppercase text-zinc-600">{k.slice(0, 3)}</div>
                    <Progress value={v} className="h-1" />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 text-[11px]">
                <span className="text-zinc-500 font-mono">
                  goal: {r.goal.type.replace(/_/g, " ")}
                </span>
                <span className={`font-mono ${moodColor(r.mood)}`}>
                  mood {r.mood > 0 ? "+" : ""}
                  {r.mood.toFixed(2)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <Card className="bg-zinc-900/40 border-zinc-800/80 h-fit lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <CardContent className="p-4 space-y-4 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold">
                    {String(detail.data?.name ?? selected)}
                    {detail.data?.is_jarvis ? (
                      <Badge variant="outline" className="ml-2 border-cyan-700/60 text-cyan-300">
                        JARVIS · resident operator · persistent identity v{String((detail.data as Record<string, unknown>).identity_version ?? "1")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {String(detail.data?.role ?? "")} · {String(detail.data?.home_name ?? "")} → {String(detail.data?.work_name ?? "")}
                    {typeof detail.data?.wallet === "number" ? ` · wallet ${Math.round(detail.data.wallet as number)}` : ""}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {detail.isLoading && <Skeleton className="h-40 w-full" />}
              {detail.data && (
                <>
                  <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/60 p-3 text-xs text-zinc-400 italic">
                    &ldquo;{String(detail.data.autobiography ?? "")}&rdquo;
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5 flex items-center gap-1">
                      <Target className="h-3 w-3" /> active goal (window {String((detail.data.goal as Record<string, unknown>)?.window)})
                    </div>
                    <div className="text-sm">
                      {String((detail.data.goal as Record<string, unknown>)?.type).replace(/_/g, " ")} —{" "}
                      <span className="font-mono">
                        {String((detail.data.goal_progress as Record<string, unknown>)?.progress)}/
                        {String((detail.data.goal_progress as Record<string, unknown>)?.target)}{" "}
                        {String((detail.data.goal_progress as Record<string, unknown>)?.unit)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Memories (salience-ranked)</div>
                    <div className="space-y-1">
                      {((detail.data.memories as Array<{ text: string; tick: number; kind: string; salience?: number }>) ?? []).map((m, i) => (
                        <div key={i} className="text-xs bg-zinc-950/50 rounded-md px-2 py-1.5 border border-zinc-800/50">
                          <span className="text-zinc-600 font-mono mr-1.5">t{m.tick}</span>
                          <span className="text-zinc-300">{m.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5 flex items-center gap-1">
                      <Heart className="h-3 w-3" /> relationships
                    </div>
                    {((detail.data.relationships as Array<{ name: string; meetings: number; affinity: number }>) ?? []).length === 0 ? (
                      <div className="text-xs text-zinc-600">no meetings recorded yet</div>
                    ) : (
                      <div className="space-y-1">
                        {((detail.data.relationships as Array<{ name: string; meetings: number; affinity: number }>) ?? []).map((r, i) => (
                          <div key={i} className="flex justify-between text-xs bg-zinc-950/50 rounded-md px-2 py-1.5 border border-zinc-800/50">
                            <span className="text-zinc-300">{r.name}</span>
                            <span className={`font-mono ${r.affinity >= 2.5 ? "text-emerald-400" : "text-zinc-500"}`}>
                              {r.meetings} meetings · affinity {r.affinity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Recent conversations</div>
                    {((detail.data.recent_communications as Array<{ tick: number; topic: string }>) ?? []).length === 0 ? (
                      <div className="text-xs text-zinc-600">none yet</div>
                    ) : (
                      ((detail.data.recent_communications as Array<{ tick: number; topic: string }>) ?? []).map((c, i) => (
                        <div key={i} className="text-xs text-zinc-400 flex gap-2">
                          <span className="text-zinc-600 font-mono">t{c.tick}</span>
                          <span>{c.topic}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="text-[10px] text-zinc-600 border-t border-zinc-800/60 pt-2">
                    inner state from /api/residents/{selected} — every field is event-derived
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
