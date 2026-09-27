"use client";

import { useEffect, useRef } from "react";
import type { IngestResult, MemoriesResponse, ReviewsResponse } from "@/lib/types";
import { Empty, ErrorBoundary, Panel, PanelHeader } from "../ui";
import { MemoryFeed } from "./MemoryFeed";
import { ReviewQueue } from "./ReviewQueue";
import { RunView } from "./RunView";
import { SubmitEvidence } from "./SubmitEvidence";

export function CourtTab({
  memories,
  memoriesErr,
  reviews,
  reviewsErr,
  lastRun,
  onRun,
  onDecided,
  onReset,
  resetting,
}: {
  memories: MemoriesResponse | null;
  memoriesErr: string | null;
  reviews: ReviewsResponse | null;
  reviewsErr: string | null;
  lastRun: IngestResult | null;
  onRun: (r: IngestResult) => void;
  onDecided: () => void;
  onReset: () => void;
  resetting: boolean;
}) {
  const runRef = useRef<HTMLDivElement>(null);
  const runId = lastRun?.runId;

  useEffect(() => {
    if (runId && runRef.current) runRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [runId]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-[calc(100dvh-8.75rem)] xl:min-h-[560px] xl:grid-cols-12">
      <div className="min-h-0 xl:col-span-3">
        <ErrorBoundary label="Agent memory">
          <MemoryFeed data={memories} error={memoriesErr} onReset={onReset} resetting={resetting} />
        </ErrorBoundary>
      </div>

      <div className="min-h-0 space-y-4 xl:col-span-5 xl:overflow-y-auto xl:pr-1">
        <ErrorBoundary label="Submit evidence">
          <SubmitEvidence onResult={onRun} disabled={resetting} />
        </ErrorBoundary>
        <div ref={runRef} className="scroll-mt-4">
          <ErrorBoundary label="Verification run">
            {lastRun ? (
              <RunView key={lastRun.runId} run={lastRun} />
            ) : (
              <Panel>
                <PanelHeader title="Verification run" />
                <div className="p-4">
                  <Empty
                    title="No verification run yet"
                    hint="Load a scenario (or paste a document) and click Run verification to see the pipeline trace, extracted claims and researcher / skeptic findings."
                  />
                </div>
              </Panel>
            )}
          </ErrorBoundary>
        </div>
      </div>

      <div className="min-h-0 xl:col-span-4">
        <ErrorBoundary label="Review queue">
          <ReviewQueue data={reviews} error={reviewsErr} onDecided={onDecided} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
