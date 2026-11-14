"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChat, useChatHistory } from "@/hooks/useNexus";
import { Send, Mic, MicOff, Volume2, VolumeX, Trash2, Loader2, Bot, User } from "lucide-react";

interface Msg {
  role: string;
  content: string;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  grounded?: boolean;
  identityVersion?: number | null;
  memoriesUsed?: number | null;
  pending?: boolean;
  error?: boolean;
}

export function ChatView() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [speak, setSpeak] = useState(false);
  const [recording, setRecording] = useState(false);
  const [asrBusy, setAsrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chat = useChat();
  const history = useChatHistory();
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (history.data?.messages?.length && messages.length === 0) {
      setMessages(history.data.messages);
    }
  }, [history.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function speakReply(text: string) {
    if (!speak) return;
    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await r.json();
      if (body.audio_base64) {
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.src = `data:audio/mp3;base64,${body.audio_base64}`;
        audio.play().catch(() => {});
      }
    } catch {
      /* TTS unavailable — honest silent degradation of voice output */
    }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || chat.isPending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "", pending: true }]);
    try {
      const res = await chat.mutateAsync(message);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: res.reply,
          provider: res.provider,
          model: res.model,
          latencyMs: res.latency_ms,
          grounded: res.grounded,
          identityVersion: res.identity_version ?? null,
          memoriesUsed: res.memories_used ?? null,
        };
        return copy;
      });
      speakReply(res.reply);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: msg, error: true };
        return copy;
      });
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setAsrBusy(true);
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType });
          const b64 = await new Promise<string>((resolve) => {
            const fr = new FileReader();
            fr.onloadend = () => resolve((fr.result as string).split(",")[1] ?? "");
            fr.readAsDataURL(blob);
          });
          const r = await fetch("/api/voice/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio_base64: b64 }),
          });
          const body = await r.json();
          if (body.text) {
            setInput(body.text);
          } else {
            setError(body.error ?? "speech recognition returned nothing");
          }
        } catch (e) {
          setError(`voice input failed: ${(e as Error).message}`);
        } finally {
          setAsrBusy(false);
        }
      };
      rec.start();
      setRecording(true);
      setError(null);
    } catch {
      setError("microphone permission denied or unavailable");
    }
  }

  return (
    <div className="h-screen flex flex-col max-w-3xl mx-auto">
      <header className="p-4 md:p-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-5 w-5 text-emerald-400" /> JARVIS
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Grounded in live NEXUS WORLD state — the model sees the real simulation, never invented facts.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant={speak ? "default" : "ghost"}
            onClick={() => setSpeak((s) => !s)}
            title={speak ? "Voice replies on" : "Voice replies off"}
          >
            {speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Clear conversation"
            onClick={async () => {
              await fetch("/api/chat", { method: "DELETE" });
              setMessages([]);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 space-y-4 pb-4">
        {history.isLoading && messages.length === 0 && <Skeleton className="h-24 w-full" />}
        {messages.length === 0 && !history.isLoading && (
          <div className="text-center text-sm text-zinc-600 py-16">
            Ask JARVIS about the world, its residents, the simulation architecture —
            or anything else. Voice input uses real server-side speech recognition.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-emerald-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-emerald-600/20 border border-emerald-600/30"
                  : m.error
                    ? "bg-red-950/40 border border-red-800/50 text-red-300"
                    : "bg-zinc-900 border border-zinc-800"
              }`}
            >
              {m.pending ? (
                <span className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
                </span>
              ) : (
                <>
                  {m.content}
                  {m.role === "assistant" && m.latencyMs != null && (
                    <div className="text-[10px] text-zinc-600 mt-1.5 font-mono">
                      {m.provider} · {m.latencyMs}ms
                      {m.grounded
                        ? ` · grounded (identity v${m.identityVersion ?? "?"}${
                            m.memoriesUsed != null ? `, ${m.memoriesUsed} memories` : ""
                          })`
                        : " · not grounded"}
                    </div>
                  )}
                </>
              )}
            </div>
            {m.role === "user" && (
              <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-zinc-400" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 md:mx-6 mb-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          {error}
        </div>
      )}

      <div className="p-4 md:p-6 pt-2 border-t border-zinc-800/80">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Button
            type="button"
            size="icon"
            variant={recording ? "destructive" : "outline"}
            onClick={toggleRecording}
            disabled={asrBusy}
            title="Hold a conversation with your voice"
          >
            {asrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={recording ? "listening…" : "Message JARVIS…"}
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-emerald-600/60 transition-colors"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || chat.isPending}>
            {chat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="text-[10px] text-zinc-600 mt-2">
          GLM reasoning via server SDK · speech recognition + synthesis are real API calls, not browser simulation
        </p>
      </div>
    </div>
  );
}
