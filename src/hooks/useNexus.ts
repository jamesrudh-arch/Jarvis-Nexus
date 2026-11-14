"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface WorldSummary {
  world_id: string;
  world_name: string;
  tick: number;
  clock: {
    sim_time_utc: string;
    local_time: string;
    local_hour: number;
    day_of_week: string;
    is_weekday: boolean;
    is_daytime: boolean;
    season: string;
  };
  weather: string;
  population: number;
  buildings: number;
  districts: number;
  roads: number;
  events: number;
  memories: number;
  communications: number;
  geo_counts: Record<string, number>;
  regions: number;
  action_distribution: Record<string, number>;
  recent_events: Array<{
    seq: number;
    tick: number;
    type: string;
    topic?: string;
    weather?: string;
    resident_id?: string;
  }>;
  economy?: {
    businesses: number;
    by_kind: Record<string, number>;
    business_cash_total: number;
    revenue_total: number;
    expenses_total: number;
    wallets_total: number;
    transactions: number;
    salaries_paid: number;
    salaries_missed: number;
    purchases_skipped: number;
    recent_transactions: Array<{ tick: number; purpose: string; buyer: unknown; product: string; total: number }>;
  };
  interiors?: { rooms: number; objects: number; buildings_with_interiors: number; coverage_note: string };
  jarvis?: {
    resident_id: string;
    identity_version: number | null;
    action: string;
    at_building: string;
    room: string | null;
    wallet: number | null;
    home: string;
  } | null;
}

export interface ResidentCard {
  resident_id: string;
  name: string;
  role: string;
  action: string;
  pos: [number, number];
  at_building: string;
  at_building_name: string;
  district: string;
  needs: Record<string, number>;
  traits: { extraversion: number; industriousness: number };
  mood: number;
  goal: { type: string; target: number; window: number; starts_tick: number; ends_tick: number };
  home_name: string;
  work_name: string;
  is_jarvis?: boolean;
  wallet?: number;
  room_name?: string | null;
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

export function useWorld(pollMs = 5000) {
  return useQuery({
    queryKey: ["world"],
    queryFn: () => j<WorldSummary>("/api/world"),
    refetchInterval: pollMs,
  });
}

export function useResidents(pollMs = 8000) {
  return useQuery({
    queryKey: ["residents"],
    queryFn: () => j<{ residents: ResidentCard[] }>("/api/residents"),
    refetchInterval: pollMs,
  });
}

export function useResidentDetail(id: string | null) {
  return useQuery({
    queryKey: ["resident", id],
    queryFn: () => j<Record<string, unknown>>(`/api/residents/${id}`),
    enabled: Boolean(id),
  });
}

export function useTickWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { ticks: number; cognition?: boolean }) =>
      j<{ advanced: { tick: number; advanced: number }; wall_ms: number }>("/api/world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["world"] });
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () =>
      j<{
        probes: Array<{ name: string; kind: string; status: string; detail: string; latency_ms: number | null; evidence: string }>;
        egress: { ip: string | null; city: string | null; country: string | null; org: string | null; note: string };
        persisted: Array<{ id: string; name: string; kind: string; status: string; detail: string | null; lastCheckedAt: string | null; latencyMs: number | null }>;
      }>("/api/providers"),
    // NOTE: probes fire real provider calls — manual refresh only, never
    // auto-poll (a 60s interval was observed keeping the GLM rate window
    // perpetually active during verification).
  });
}

export function useSystem() {
  return useQuery({
    queryKey: ["system"],
    queryFn: () =>
      j<{
        app: string; engine: string;
        runtime: Record<string, string>;
        database: { provider: string; url_shape: string; counts: Record<string, number> };
        environment: Record<string, string>;
        world: { tick: number; sim_time: string; population: number; weather: string };
        blockers: Array<{ id: string; title: string; impact: string; required: string }>;
        honesty: string;
      }>("/api/system"),
  });
}

export function useLab() {
  return useQuery({
    queryKey: ["lab"],
    queryFn: () =>
      j<{
        register: {
          provenance: string; total: number; by_state: Record<string, number>;
          notable: Array<{ name: string; category: string; state: string; purpose: string; evidence: string; limitations: string }>;
        };
        runtime: Array<{ name: string; runtime_status: string; detail: string; audit_state: string }>;
        task_count: number;
      }>("/api/lab"),
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () =>
      j<{ tasks: Array<{ id: string; key: string; title: string; state: string; priority: string; detail: string | null; evidence: string | null; updatedAt: string }> }>("/api/tasks"),
    refetchInterval: 15000,
  });
}

export function useChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      j<{
        reply: string; provider: string; model: string; latency_ms: number;
        tokens: number | null; grounded: boolean;
        identity_version?: number; memories_used?: number;
      }>("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-history"] }),
  });
}

export function useChatHistory() {
  return useQuery({
    queryKey: ["chat-history"],
    queryFn: () =>
      j<{ messages: Array<{ id: string; role: string; content: string; provider?: string; model?: string; latencyMs?: number; createdAt: string }> }>("/api/chat"),
  });
}
