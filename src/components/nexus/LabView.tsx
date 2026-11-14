"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLab } from "@/hooks/useNexus";
import { FlaskConical, CircleDashed, CheckCircle2, XCircle } from "lucide-react";

function stateStyle(s: string) {
  if (s === "OPERATIONAL") return "border-emerald-600/50 text-emerald-300";
  if (s === "REGISTERED" || s === "INSTALLED") return "border-amber-600/50 text-amber-300";
  return "border-zinc-700 text-zinc-400";
}

export function LabView() {
  const { data, isLoading } = useLab();

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-zinc-500" /> NEXUS Laboratory
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Capability-first integration inventory. Runtime rows describe what this deployment can actually execute —
          sidecars that are not part of this runtime are labelled as such, never faked.
        </p>
      </header>

      {/* runtime capability */}
      <Card className="bg-zinc-900/40 border-zinc-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">Runtime capability (this deployment)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {(data?.runtime ?? []).map((r) => (
            <div key={r.name} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-sm">{r.name}</span>
                <Badge
                  variant="outline"
                  className={
                    r.runtime_status === "operational"
                      ? "border-emerald-600/50 text-emerald-300"
                      : r.runtime_status === "offline-in-this-runtime"
                        ? "border-amber-600/50 text-amber-300"
                        : "border-red-700/50 text-red-300"
                  }
                >
                  {r.runtime_status}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{r.detail}</p>
              <p className="text-[10px] text-zinc-600 mt-1.5 font-mono">{r.audit_state}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* register summary */}
      <Card className="bg-zinc-900/40 border-zinc-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">
            Integration register — {data?.register.total ?? "…"} entries
          </CardTitle>
          <p className="text-[11px] text-zinc-600">{data?.register.provenance}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(data?.register.by_state ?? {}).map(([state, n]) => (
              <Badge key={state} variant="outline" className={stateStyle(state)}>
                {state}: {n}
              </Badge>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {(data?.register.notable ?? []).map((n) => (
              <div key={n.name} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{n.name}</span>
                  <Badge variant="outline" className={`shrink-0 ${stateStyle(n.state)}`}>
                    {n.state}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{n.purpose}</p>
                {n.evidence && (
                  <p className="text-[10px] text-zinc-600 mt-1.5 flex gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5 text-emerald-700" /> {n.evidence}
                  </p>
                )}
                {n.limitations && (
                  <p className="text-[10px] text-zinc-600 mt-1 flex gap-1">
                    <XCircle className="h-3 w-3 shrink-0 mt-0.5 text-amber-700" /> {n.limitations}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-4 flex items-center gap-1.5">
            <CircleDashed className="h-3 w-3" /> full register: NEXUS_WORLD/integration/register.json (95 records) — states are audit conclusions with per-entry evidence, not live probes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
