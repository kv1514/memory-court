"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IngestResult, MemoriesResponse, ReviewsResponse, StatusResponse } from "@/lib/types";
import { apiGet, apiPost, errMsg } from "./api";
import { AskTab } from "./AskTab";
import { AuditTab } from "./AuditTab";
import { CourtTab } from "./court/CourtTab";
import { EvalTab } from "./EvalTab";
import { fmtMs } from "./format";
import { useElapsed } from "./hooks";
import { TimelineTab } from "./TimelineTab";
import { TopBar } from "./TopBar";
import { Button, Dot, ErrorBoundary, Icon, cx } from "./ui";

type TabId = "court" | "ask" | "timeline" | "eval" | "audit";

const TABS: { id: TabId; label: string }[] = [
  { id: "court", label: "Court" },
  { id: "ask", label: "Ask the agent" },
  { id: "timeline", label: "Timeline" },
  { id: "eval", label: "Evaluations" },
  { id: "audit", label: "Audit log" },
];

const POLL_MS = 6000;

interface ResetResponse {
  ok: boolean;
  seeded: number;
  ms: number;
  error?: string;
}

type ResetState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

export default function Dashboard() {
  const [tab, setTab] = useState<TabId>("court");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoriesResponse | null>(null);
  const [memoriesErr, setMemoriesErr] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);
  const [reviewsErr, setReviewsErr] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<IngestResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reset, setReset] = useState<ResetState>({ phase: "idle" });

  const resetting = reset.phase === "running";
  const resetElapsed = useElapsed(resetting);
  const pausedRef = useRef(false);
  const inflightRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await apiGet<StatusResponse>("/api/status"));
      setStatusErr(null);
    } catch (e) {
      setStatusErr(errMsg(e));
    }
  }, []);

  const loadMemories = useCallback(async () => {
    try {
      setMemories(await apiGet<MemoriesResponse>("/api/memories?includeExpired=1"));
      setMemoriesErr(null);
    } catch (e) {
      setMemoriesErr(errMsg(e));
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      setReviews(await apiGet<ReviewsResponse>("/api/reviews"));
      setReviewsErr(null);
    } catch (e) {
      setReviewsErr(errMsg(e));
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStatus(), loadMemories(), loadReviews()]);
  }, [loadStatus, loadMemories, loadReviews]);

  /** Called after every mutation: refetch the live panels and bump other tabs. */
  const refreshAll = useCallback(async () => {
    await loadAll();
    setRefreshKey((k) => k + 1);
  }, [loadAll]);

  useEffect(() => {
    const tick = async () => {
      if (pausedRef.current || inflightRef.current || document.hidden) return;
      inflightRef.current = true;
      try {
        await loadAll();
      } finally {
        inflightRef.current = false;
      }
    };
    // First load always runs (even in a background tab); later polls skip hidden tabs.
    inflightRef.current = true;
    void loadAll().finally(() => {
      inflightRef.current = false;
    });
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadAll]);

  useEffect(() => {
    if (reset.phase !== "done") return;
    const id = window.setTimeout(() => setReset({ phase: "idle" }), 8000);
    return () => window.clearTimeout(id);
  }, [reset]);

  const doReset = useCallback(async () => {
    if (resetting) return;
    const ok = window.confirm(
      "Reset the demo?\n\nThis wipes the demo GBrain brain and the audit store, then reseeds the baseline memories. It takes ~20–60 seconds.",
    );
    if (!ok) return;
    pausedRef.current = true;
    setReset({ phase: "running" });
    try {
      const r = await apiPost<ResetResponse>("/api/demo/reset");
      if (!r.ok) throw new Error(r.error || "Reset reported failure");
      setLastRun(null);
      setReset({ phase: "done", message: `Demo reset — seeded ${r.seeded} baseline memories in ${fmtMs(r.ms)}.` });
    } catch (e) {
      setReset({ phase: "error", message: errMsg(e) });
    } finally {
      pausedRef.current = false;
      await refreshAll();
    }
  }, [resetting, refreshAll]);

  const onRun = useCallback(
    (r: IngestResult) => {
      setLastRun(r);
      void refreshAll();
    },
    [refreshAll],
  );

  const onDecided = useCallback(() => {
    void refreshAll();
  }, [refreshAll]);

  const pendingCount = reviews
    ? (reviews.items ?? []).filter((i) => i.status === "pending").length
    : status
      ? status.counts.pendingReviews
      : null;

  const g = status?.gbrain;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
        <TopBar
          status={status}
          statusErr={statusErr}
          pendingCount={pendingCount}
          onReset={() => void doReset()}
          resetting={resetting}
        />
        <nav role="tablist" aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto px-2 lg:px-4">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cx(
                  "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/60",
                  active ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {t.label}
                {t.id === "court" && pendingCount ? (
                  <span className="rounded-full bg-amber-500/15 px-1.5 font-mono text-[10.5px] text-amber-300">{pendingCount}</span>
                ) : null}
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-x-2 bottom-0 h-px transition-opacity duration-200",
                    active ? "bg-zinc-100 opacity-100" : "opacity-0",
                  )}
                />
              </button>
            );
          })}
        </nav>
      </header>

      <div className="space-y-2 px-4 pt-3 empty:hidden lg:px-6">
        {reset.phase === "running" && (
          <div className="mc-fade-in flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/[0.07] px-3 py-2 text-xs text-sky-200">
            <Dot tone="sky" pulse />
            Resetting demo — wiping the demo GBrain brain and audit store, then reseeding baseline memories…
            <span className="ml-auto font-mono tabular-nums text-sky-300">{fmtMs(resetElapsed)}</span>
          </div>
        )}
        {reset.phase === "done" && (
          <div className="mc-fade-in flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-200">
            <Icon name="check" className="text-emerald-400" />
            {reset.message}
          </div>
        )}
        {reset.phase === "error" && (
          <div role="alert" className="mc-fade-in flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-200">
            <Icon name="alert" className="mt-0.5 text-rose-400" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Reset failed</div>
              <div className="mt-0.5 break-words font-mono text-[11px] text-rose-300/90">{reset.message}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setReset({ phase: "idle" })}>
              Dismiss
            </Button>
          </div>
        )}
        {g && !g.connected && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2 text-xs text-red-200">
            <Icon name="database" className="mt-0.5 text-red-400" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">GBrain is not connected — memory reads and writes will fail.</div>
              <div className="mt-0.5 break-words font-mono text-[11px] text-red-300/90">{g.error ?? "No error reported."}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-zinc-500">home: {g.home}</div>
              {g.stderrTail && g.stderrTail.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-red-300/80">stderr tail ({g.stderrTail.length} lines)</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10.5px] text-zinc-400">
                    {g.stderrTail.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
        {statusErr && !status && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-200">
            <Icon name="alert" className="mt-0.5 text-rose-400" />
            <div>
              <span className="font-medium">Status endpoint error: </span>
              <span className="font-mono text-[11px]">{statusErr}</span>
            </div>
          </div>
        )}
      </div>

      <main className="flex-1 px-4 py-4 lg:px-6">
        <div className={cx(tab !== "court" && "hidden")}>
          <CourtTab
            memories={memories}
            memoriesErr={memoriesErr}
            reviews={reviews}
            reviewsErr={reviewsErr}
            lastRun={lastRun}
            onRun={onRun}
            onDecided={onDecided}
            onReset={() => void doReset()}
            resetting={resetting}
          />
        </div>
        <div className={cx(tab !== "ask" && "hidden")}>
          <ErrorBoundary label="Ask the agent">
            <AskTab />
          </ErrorBoundary>
        </div>
        <div className={cx(tab !== "timeline" && "hidden")}>
          <ErrorBoundary label="Timeline">
            <TimelineTab entities={memories?.entities ?? []} refreshKey={refreshKey} active={tab === "timeline"} />
          </ErrorBoundary>
        </div>
        <div className={cx(tab !== "eval" && "hidden")}>
          <ErrorBoundary label="Evaluations">
            <EvalTab />
          </ErrorBoundary>
        </div>
        <div className={cx(tab !== "audit" && "hidden")}>
          <ErrorBoundary label="Audit log">
            <AuditTab refreshKey={refreshKey} active={tab === "audit"} />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
