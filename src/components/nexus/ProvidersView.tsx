"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useProviders } from "@/hooks/useNexus";
import { RefreshCw, Globe, ShieldCheck, ShieldAlert } from "lucide-react";

function statusStyle(s: string) {
  if (s === "operational") return "border-emerald-600/50 text-emerald-300";
  if (s === "degraded") return "border-amber-500/50 text-amber-300";
  if (s === "blocked") return "border-red-600/50 text-red-300";
  return "border-zinc-700 text-zinc-400";
}

export function ProvidersView() {
  const { data, isLoading, isFetching, refetch } = useProviders();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">AI providers & infrastructure</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Live probes with timestamps and latencies. A provider is only listed operational after a real successful
            call in this session.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> re-probe
        </Button>
      </header>

      <div className="grid gap-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        {(data?.probes ?? []).map((p) => (
          <Card key={p.name} className="bg-zinc-900/40 border-zinc-800/80">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {p.status === "operational" ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className={`h-4 w-4 ${p.status === "blocked" ? "text-red-400" : "text-amber-400"}`} />
                  )}
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">{p.kind}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {p.latency_ms != null && (
                    <span className="text-xs font-mono text-zinc-500">{p.latency_ms}ms</span>
                  )}
                  <Badge variant="outline" className={statusStyle(p.status)}>{p.status}</Badge>
                </div>
              </div>
              <p className="text-sm text-zinc-400 mt-2">{p.detail}</p>
              <p className="text-[10px] text-zinc-600 mt-1.5 font-mono">{p.evidence}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.egress && (
        <Card className="bg-zinc-900/40 border-zinc-800/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Globe className="h-4 w-4 text-zinc-500" /> Server egress route
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-zinc-600">IP</div>
                <div className="font-mono">{data.egress.ip ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-600">City</div>
                <div className="font-mono">{data.egress.city ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-600">Country</div>
                <div className="font-mono">{data.egress.country ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-600">Network</div>
                <div className="font-mono text-xs mt-0.5">{data.egress.org ?? "—"}</div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 mt-3">
              {data.egress.note} — this is the route OpenAI&apos;s edge evaluates; it is why the unauthenticated
              OpenAI baseline returns a pre-auth 403 from this sandbox while production Railway (US egress) is unaffected.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-zinc-600">
        Provider selection honours capability, context and modality constraints; when a required capability is
        unavailable the request fails honestly rather than silently substituting an inferior model.
      </p>
    </div>
  );
}
