"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useTasks } from "@/hooks/useNexus";
import { ClipboardList } from "lucide-react";

const STATE_STYLE: Record<string, string> = {
  PLANNED: "border-zinc-700 text-zinc-400",
  IN_PROGRESS: "border-amber-600/50 text-amber-300",
  IMPLEMENTED: "border-cyan-700/50 text-cyan-300",
  INTEGRATION_PENDING: "border-cyan-700/50 text-cyan-300",
  TESTING: "border-violet-600/50 text-violet-300",
  VERIFIED: "border-emerald-600/50 text-emerald-300",
  DEPLOYED: "border-emerald-400/60 text-emerald-200",
  BLOCKED: "border-red-600/50 text-red-300",
  FAILED: "border-red-700 text-red-400",
};

const STATE_ORDER = [
  "PLANNED", "IN_PROGRESS", "IMPLEMENTED", "INTEGRATION_PENDING", "TESTING",
  "VERIFIED", "DEPLOYED", "BLOCKED", "FAILED",
];

export function LedgerView() {
  const { data, isLoading } = useTasks();
  const qc = useQueryClient();
  void qc;

  const tasks = data?.tasks ?? [];
  const byState = STATE_ORDER.map((s) => ({
    state: s,
    n: tasks.filter((t) => t.state === s).length,
  })).filter((s) => s.n > 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-zinc-500" /> Engineering ledger
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Persistent task tracking with the nine-state lifecycle. A task is never complete merely because code was
          generated — states carry evidence, and every transition is written to the audit log.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {byState.map((s) => (
          <Badge key={s.state} variant="outline" className={STATE_STYLE[s.state] ?? STATE_STYLE.PLANNED}>
            {s.state.replace(/_/g, " ").toLowerCase()}: {s.n}
          </Badge>
        ))}
      </div>

      <div className="space-y-2.5">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        {tasks.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">{t.priority}</span>
                <span className="text-sm font-medium truncate">{t.title}</span>
              </div>
              <Badge variant="outline" className={`shrink-0 ${STATE_STYLE[t.state] ?? STATE_STYLE.PLANNED}`}>
                {t.state}
              </Badge>
            </div>
            {t.detail && <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{t.detail}</p>}
            {t.evidence && (
              <p className="text-[10px] text-zinc-600 mt-1.5 font-mono flex gap-1.5">
                <span className="text-emerald-800">evidence:</span> {t.evidence}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
