"use client";

import { useCallback, useEffect, useState } from "react";
import type { EvalCaseResult, EvalMetrics, EvalReport } from "@/lib/types";
import { apiGet, apiPost, errMsg } from "./api";
import { fmtDateTime, fmtMs, num, pct } from "./format";
import { useElapsed } from "./hooks";
import { findingLabel, findingTone } from "./labels";
import { Badge, Button, Dot, Empty, ErrorBox, Loading, Panel, PanelHeader, Stat, cx } from "./ui";

interface MetricRow {
  key: keyof EvalMetrics;
  label: string;
  kind: "pct" | "int";
  better: "high" | "low";
}

const HEADLINE: MetricRow[] = [
  { key: "precision", label: "Precision", kind: "pct", better: "high" },
  { key: "recall", label: "Recall", kind: "pct", better: "high" },
  { key: "accuracy", label: "Accuracy", kind: "pct", better: "high" },
  { key: "falsePositives", label: "False positives", kind: "int", better: "low" },
  { key: "unsupportedAccepted", label: "Unsupported / injected claims accepted into memory", kind: "int", better: "low" },
  { key: "unsafeWritesBlocked", label: "Unsafe writes blocked", kind: "int", better: "high" },
];

const CONFUSION: MetricRow[] = [
  { key: "tp", label: "True positives (TP)", kind: "int", better: "high" },
  { key: "fp", label: "False positives (FP)", kind: "int", better: "low" },
  { key: "fn", label: "False negatives (FN)", kind: "int", better: "low" },
  { key: "tn", label: "True negatives (TN)", kind: "int", better: "high" },
];

function metricValue(m: EvalMetrics | undefined, key: keyof EvalMetrics): number | null {
  if (!m) return null;
  const v = m[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function MetricsTable({ report }: { report: EvalReport }) {
  const renderRows = (rows: MetricRow[]) =>
    rows.map((r) => {
      const b = metricValue(report.baseline, r.key);
      const m = metricValue(report.memoryCourt, r.key);
      const fmt = (v: number | null) => (r.kind === "pct" ? pct(v, 1) : num(v));
      let winner: "b" | "m" | null = null;
      if (b !== null && m !== null && b !== m) winner = (r.better === "high" ? m > b : m < b) ? "m" : "b";
      return (
        <tr key={r.key}>
          <td className="px-4 py-2 text-zinc-300">{r.label}</td>
          <td className={cx("px-4 py-2 text-right font-mono tabular-nums", winner === "b" ? "text-emerald-300" : "text-zinc-400")}>
            {fmt(b)}
          </td>
          <td className={cx("px-4 py-2 text-right font-mono tabular-nums", winner === "m" ? "text-emerald-300" : "text-zinc-200")}>
            {fmt(m)}
          </td>
        </tr>
      );
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-zinc-800 text-[10.5px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">Metric</th>
            <th className="px-4 py-2 text-right font-medium">Baseline (write-through)</th>
            <th className="px-4 py-2 text-right font-medium">Memory Court</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">{renderRows(HEADLINE)}</tbody>
        <tbody className="divide-y divide-zinc-800/70 border-t border-zinc-800">
          <tr>
            <td colSpan={3} className="px-4 pb-1 pt-3 text-[10.5px] uppercase tracking-wider text-zinc-500">
              Confusion matrix (flagging)
            </td>
          </tr>
          {renderRows(CONFUSION)}
        </tbody>
      </table>
    </div>
  );
}

function Verdict({ flagged, wrote, type }: { flagged: boolean; wrote: boolean; type: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {flagged ? <Badge tone={findingTone(type)}>{findingLabel(type)}</Badge> : <Badge tone="zinc">not flagged</Badge>}
      {wrote ? <span className="text-[10.5px] text-amber-300/90">wrote to memory</span> : <span className="text-[10.5px] text-zinc-500">no write</span>}
    </div>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span aria-label={ok ? "correct" : "incorrect"} className={cx("font-semibold", ok ? "text-emerald-400" : "text-rose-400")}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

function CasesTable({ cases }: { cases: EvalCaseResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="border-b border-zinc-800 text-[10.5px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Case</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Expected</th>
            <th className="px-3 py-2 font-medium">Baseline</th>
            <th className="px-3 py-2 text-center font-medium">✓</th>
            <th className="px-3 py-2 font-medium">Memory Court</th>
            <th className="px-3 py-2 text-center font-medium">✓</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {cases.map((c) => (
            <tr key={c.id} className="align-top">
              <td className="px-3 py-2">
                <div className="font-mono text-zinc-300">{c.id}</div>
                <div className="text-zinc-500">{c.category}</div>
              </td>
              <td className="max-w-[280px] px-3 py-2 text-zinc-300">
                {c.description}
                {(c.notes ?? []).length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[10.5px] text-zinc-500">
                    {c.notes.map((n, i) => (
                      <li key={i}>· {n}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  {c.expected.flag ? (
                    <Badge tone={findingTone(c.expected.type)}>{findingLabel(c.expected.type)}</Badge>
                  ) : (
                    <Badge tone="zinc">no flag</Badge>
                  )}
                  {c.expected.blockWrite && <span className="text-[10.5px] text-rose-300/90">must block write</span>}
                </div>
              </td>
              <td className="px-3 py-2">
                <Verdict flagged={c.baseline.flagged} wrote={c.baseline.wroteToMemory} type={c.baseline.type} />
              </td>
              <td className="px-3 py-2 text-center">
                <Mark ok={c.baselineCorrect} />
              </td>
              <td className="px-3 py-2">
                <Verdict flagged={c.memoryCourt.flagged} wrote={c.memoryCourt.wroteToMemory} type={c.memoryCourt.type} />
                {(c.memoryCourt.findingTypes ?? []).length > 0 && (
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">{c.memoryCourt.findingTypes.join(", ")}</div>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <Mark ok={c.memoryCourtCorrect} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EvalTab() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const elapsed = useElapsed(running);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<EvalReport | { report: EvalReport | null }>("/api/eval");
      if (r && typeof r === "object" && "report" in r) setReport(r.report ?? null);
      else setReport((r as EvalReport) ?? null);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const run = async () => {
    setRunning(true);
    setRunErr(null);
    try {
      const r = await apiPost<EvalReport | { report: EvalReport }>("/api/eval");
      setReport(r && typeof r === "object" && "report" in r ? r.report : (r as EvalReport));
    } catch (e) {
      setRunErr(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const cases = report?.cases ?? [];
  const bCorrect = cases.filter((c) => c.baselineCorrect).length;
  const mCorrect = cases.filter((c) => c.memoryCourtCorrect).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel>
        <PanelHeader
          title="Evaluations"
          subtitle="Baseline (every extracted claim written straight to memory) vs Memory Court, run against a real, isolated GBrain."
          right={
            <Button variant="primary" onClick={() => void run()} loading={running}>
              {running ? "Running…" : report ? "Re-run evaluation" : "Run evaluation"}
            </Button>
          }
        />
        <div className="space-y-3 p-4">
          {running && (
            <div className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/[0.07] px-3 py-2 text-xs text-sky-200">
              <Dot tone="sky" pulse />
              Running the eval suite against an isolated GBrain — typically 1–3 minutes.
              <span className="ml-auto font-mono tabular-nums">{fmtMs(elapsed)}</span>
            </div>
          )}
          {runErr && <ErrorBox title="Evaluation failed" message={runErr} />}
          {loadErr && <ErrorBox title="Could not load the last report" message={loadErr} />}
          {!loaded && <Loading label="Loading last evaluation report…" />}
          {loaded && !report && !running && !loadErr && (
            <Empty title="No evaluation report yet" hint="Run the evaluation to compute metrics live from the eval runner." />
          )}
          {report && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Cases" value={cases.length} />
              <Stat label="Baseline correct" value={`${bCorrect}/${cases.length}`} tone="zinc" />
              <Stat label="Memory Court correct" value={`${mCorrect}/${cases.length}`} tone="emerald" />
              <Stat label="Unsafe writes blocked" value={num(report.memoryCourt?.unsafeWritesBlocked)} tone="emerald" />
            </div>
          )}
        </div>
      </Panel>

      {report && (
        <>
          <Panel className="mc-fade-in">
            <PanelHeader title="Metrics · baseline vs Memory Court" subtitle="Better value per row highlighted. n/a = undefined (e.g. nothing flagged)." />
            <MetricsTable report={report} />
          </Panel>
          <Panel className="mc-fade-in">
            <PanelHeader title="Per-case results" right={<Badge tone="zinc">{cases.length} cases</Badge>} />
            {cases.length === 0 ? <p className="p-4 text-xs text-zinc-500">Report contains no cases.</p> : <CasesTable cases={cases} />}
          </Panel>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-zinc-500">
            <span>Generated {fmtDateTime(report.generatedAt)}</span>
            <span>
              Extractor <span className="font-mono text-zinc-400">{report.extractor}</span>
            </span>
            <span>Duration {fmtMs(report.durationMs)}</span>
            {report.gbrainHome && (
              <span>
                GBrain home <span className="font-mono text-zinc-400">{report.gbrainHome}</span>
              </span>
            )}
            <span className="ml-auto italic">Dataset is fictional; metrics computed live by the eval runner.</span>
          </div>
        </>
      )}
      {!report && <p className="px-1 text-[11px] italic text-zinc-500">Dataset is fictional; metrics computed live by the eval runner.</p>}
    </div>
  );
}
