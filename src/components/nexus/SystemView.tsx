"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystem } from "@/hooks/useNexus";
import { Settings2, Lock, Unlock, Database, Cpu, AlertTriangle } from "lucide-react";

export function SystemView() {
  const { data, isLoading } = useSystem();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-zinc-500" /> System
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Runtime facts, environment presence (names only — values are never exposed), database counts and the honest
          blocker list.
        </p>
      </header>

      {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}

      {data && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900/40 border-zinc-800/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-zinc-500" /> Runtime
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-zinc-500">engine</span><span className="font-mono text-xs">{data.engine}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">node</span><span className="font-mono text-xs">{data.runtime.node}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">framework</span><span className="font-mono text-xs">{data.runtime.next}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">world tick</span><span className="font-mono text-xs">{data.world.tick} ({data.world.sim_time.slice(0, 16)})</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">weather</span><span className="font-mono text-xs">{data.world.weather}</span></div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/40 border-zinc-800/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Database className="h-4 w-4 text-zinc-500" /> Database
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-zinc-500">provider</span><span className="font-mono text-xs">{data.database.provider}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">location</span><span className="font-mono text-xs">{data.database.url_shape}</span></div>
                {Object.entries(data.database.counts).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-zinc-500">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono text-xs">{v.toLocaleString()}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-zinc-900/40 border-zinc-800/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Environment variables (presence only)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(data.environment).map(([name, state]) => (
                <Badge
                  key={name}
                  variant="outline"
                  className={state === "set" ? "border-emerald-600/50 text-emerald-300" : "border-red-700/50 text-red-300"}
                >
                  {state === "set" ? <Unlock className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                  {name}: {state}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Outstanding blockers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.blockers.map((b) => (
                <div key={b.id} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3">
                  <div className="text-sm font-medium">{b.title}</div>
                  <p className="text-xs text-zinc-500 mt-1"><span className="text-zinc-600">impact:</span> {b.impact}</p>
                  <p className="text-xs text-zinc-500 mt-0.5"><span className="text-zinc-600">required:</span> {b.required}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-[11px] text-zinc-600 pb-4">{data.honesty}</p>
        </>
      )}
    </div>
  );
}
