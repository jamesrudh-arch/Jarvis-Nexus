"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, MessageSquare, Globe2, Users, FlaskConical,
  Network, ClipboardList, Settings2, Activity,
} from "lucide-react";
import { useWorld } from "@/hooks/useNexus";
import { DashboardView } from "@/components/nexus/DashboardView";
import { ChatView } from "@/components/nexus/ChatView";
import { WorldView } from "@/components/nexus/WorldView";
import { ResidentsView } from "@/components/nexus/ResidentsView";
import { LabView } from "@/components/nexus/LabView";
import { ProvidersView } from "@/components/nexus/ProvidersView";
import { LedgerView } from "@/components/nexus/LedgerView";
import { SystemView } from "@/components/nexus/SystemView";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "chat", label: "JARVIS", icon: MessageSquare },
  { id: "world", label: "NEXUS World", icon: Globe2 },
  { id: "residents", label: "Residents", icon: Users },
  { id: "lab", label: "Laboratory", icon: FlaskConical },
  { id: "providers", label: "Providers", icon: Network },
  { id: "ledger", label: "Ledger", icon: ClipboardList },
  { id: "system", label: "System", icon: Settings2 },
] as const;

type ViewId = (typeof NAV)[number]["id"];

export default function Home() {
  const [view, setView] = useState<ViewId>("dashboard");
  const { data: world } = useWorld();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-zinc-950 text-zinc-100">
      {/* ------------------------------------------------ sidebar */}
      <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="flex md:flex-col gap-1 p-3 md:p-4 h-full overflow-x-auto md:overflow-visible">
          <div className="hidden md:flex items-center gap-2.5 px-2 pb-5 pt-1">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Activity className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-semibold tracking-tight leading-none">JARVIS NEXUS</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">command centre</div>
            </div>
          </div>

          <nav className="flex md:flex-col gap-1 min-w-max md:min-w-0 flex-1" aria-label="Primary">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-emerald-500/10 border border-emerald-500/25"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="h-4 w-4 relative" />
                  <span className="relative font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="hidden md:block mt-auto rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-[11px] leading-relaxed text-zinc-500">
            <div className="flex justify-between">
              <span>world</span>
              <span className="font-mono text-zinc-300">{world?.world_name ?? "—"}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>tick</span>
              <span className="font-mono text-zinc-300">{world?.tick ?? "…"}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>local</span>
              <span className="font-mono text-zinc-300">{world?.clock.local_time ?? "…"}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>weather</span>
              <span className="font-mono text-zinc-300">{world?.weather ?? "…"}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>events</span>
              <span className="font-mono text-zinc-300">{world?.events?.toLocaleString() ?? "…"}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------ main */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="min-h-screen"
          >
            {view === "dashboard" && <DashboardView onNavigate={(v) => setView(v as ViewId)} />}
            {view === "chat" && <ChatView />}
            {view === "world" && <WorldView />}
            {view === "residents" && <ResidentsView />}
            {view === "lab" && <LabView />}
            {view === "providers" && <ProvidersView />}
            {view === "ledger" && <LedgerView />}
            {view === "system" && <SystemView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
