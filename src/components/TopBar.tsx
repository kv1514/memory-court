"use client";

import type { StatusResponse } from "@/lib/types";
import { Button, Dot, TEXT_TONE, cx, type Tone } from "./ui";

function Pill({
  label,
  value,
  tone,
  title,
  pulse,
}: {
  label: string;
  value: string;
  tone: Tone;
  title?: string;
  pulse?: boolean;
}) {
  return (
    <div
      title={title}
      className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-xs"
    >
      <Dot tone={tone} pulse={pulse} />
      <span className="text-zinc-500">{label}</span>
      <span className={cx("font-medium", TEXT_TONE[tone])}>{value}</span>
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/80 bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-100 shadow-sm">
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
        <path d="M12 3.5v17M7 20.5h10M5 7h14" />
        <path d="M5 7l-2.6 6a2.8 2.8 0 0 0 5.2 0L5 7zM19 7l-2.6 6a2.8 2.8 0 0 0 5.2 0L19 7z" />
      </svg>
    </div>
  );
}

export function TopBar({
  status,
  statusErr,
  pendingCount,
  onReset,
  resetting,
}: {
  status: StatusResponse | null;
  statusErr: string | null;
  pendingCount: number | null;
  onReset: () => void;
  resetting: boolean;
}) {
  const g = status?.gbrain;
  let gTone: Tone = "zinc";
  let gText = "checking…";
  let gTitle: string | undefined;
  let gPulse = true;
  if (g) {
    gPulse = false;
    if (g.connected) {
      gTone = "emerald";
      const version = g.version ? (g.version.startsWith("v") ? g.version : `v${g.version}`) : null;
      gText = ["connected", version, g.engine].filter(Boolean).join(" · ");
      gTitle = `GBrain home: ${g.home}${g.tools !== undefined ? ` · ${g.tools} MCP tools` : ""}`;
    } else {
      gTone = "red";
      gText = "disconnected";
      gTitle = g.error ?? "GBrain is not connected";
    }
  } else if (statusErr) {
    gTone = "red";
    gText = "status unavailable";
    gTitle = statusErr;
    gPulse = false;
  }

  const ex = status?.extractor;
  const exText = ex ? (ex.mode === "llm" ? `LLM · ${ex.model ?? "model"}` : "rules") : "—";
  const exTitle = ex
    ? ex.mode === "llm"
      ? "Claims extracted by an LLM, then verified deterministically"
      : `Deterministic rule extractor${ex.llmConfigured ? " (LLM configured but not active)" : " (no LLM key configured)"}`
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:px-6">
      <div className="flex items-center gap-3">
        <Logo />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-zinc-50">Memory Court</div>
          <div className="text-[11.5px] text-zinc-500">Verification &amp; provenance for persistent AI memory</div>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Pill label="GBrain" value={gText} tone={gTone} title={gTitle} pulse={gPulse} />
        <Pill label="Extractor" value={exText} tone={ex ? (ex.mode === "llm" ? "violet" : "sky") : "zinc"} title={exTitle} />
        <Pill
          label="Pending reviews"
          value={pendingCount === null ? "—" : String(pendingCount)}
          tone={pendingCount ? "amber" : "zinc"}
        />
        {status && (
          <span className="hidden font-mono text-[10.5px] text-zinc-600 2xl:inline" title="Documents · claims · audit events">
            {status.counts.documents} docs · {status.counts.claims} claims · {status.counts.auditEvents} events
          </span>
        )}
        <Button variant="danger" size="sm" onClick={onReset} loading={resetting}>
          {resetting ? "Resetting…" : "Reset demo"}
        </Button>
      </div>
    </div>
  );
}
