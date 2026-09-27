"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { DemoScenario, IngestResult } from "@/lib/types";
import { apiGet, apiPost, errMsg } from "../api";
import { fmtMs } from "../format";
import { useElapsed } from "../hooks";
import { Button, Dot, ErrorBox, Panel, PanelHeader, cx, inputCls } from "../ui";

interface IngestBody {
  title: string;
  text: string;
  documentDate?: string;
  author?: string;
}

export function SubmitEvidence({ onResult, disabled }: { onResult: (r: IngestResult) => void; disabled?: boolean }) {
  const [scenarios, setScenarios] = useState<DemoScenario[] | null>(null);
  const [scenarioErr, setScenarioErr] = useState<string | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [loaded, setLoaded] = useState<DemoScenario | null>(null);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");

  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const elapsed = useElapsed(running);

  const loadScenarios = useCallback(async () => {
    setLoadingScenarios(true);
    try {
      const r = await apiGet<{ scenarios: DemoScenario[] }>("/api/demo/scenarios");
      setScenarios(r.scenarios ?? []);
      setScenarioErr(null);
    } catch (e) {
      setScenarioErr(errMsg(e));
    } finally {
      setLoadingScenarios(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadScenarios(), 0);
    return () => window.clearTimeout(t);
  }, [loadScenarios]);

  const fill = (s: DemoScenario) => {
    setTitle(s.document.title ?? "");
    setDate(s.document.documentDate ?? "");
    setAuthor(s.document.author ?? "");
    setText(s.document.text ?? "");
    setLoaded(s);
    setErr(null);
  };

  const clear = () => {
    setTitle("");
    setDate("");
    setAuthor("");
    setText("");
    setLoaded(null);
    setErr(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim() || running) return;
    setRunning(true);
    setErr(null);
    try {
      const body: IngestBody = { title: title.trim(), text };
      if (date) body.documentDate = date;
      if (author.trim()) body.author = author.trim();
      const r = await apiPost<IngestResult>("/api/ingest", body);
      onResult(r);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setRunning(false);
    }
  };

  const canSubmit = Boolean(title.trim() && text.trim()) && !running && !disabled;

  return (
    <Panel>
      <PanelHeader
        title="Submit evidence"
        subtitle="Documents are untrusted data. Claims are verified against GBrain before anything is written."
      />
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Demo scenarios</span>
            <span className="text-[11px] text-zinc-600">loads the form — doesn&apos;t submit</span>
          </div>
          {scenarioErr && (
            <ErrorBox
              title="Could not load scenarios"
              message={scenarioErr}
              action={
                <Button size="sm" onClick={() => void loadScenarios()} loading={loadingScenarios}>
                  Retry
                </Button>
              }
            />
          )}
          {!scenarios && !scenarioErr && <div className="h-8 animate-pulse rounded-md bg-zinc-800/40" />}
          {scenarios && scenarios.length === 0 && <p className="text-xs text-zinc-500">No demo scenarios defined.</p>}
          {scenarios && scenarios.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {scenarios.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  title={`${s.description}\n\nExpected: ${s.expected}`}
                  onClick={() => fill(s)}
                  className={cx(
                    "rounded-md border px-2 py-1 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60",
                    loaded?.id === s.id
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/60",
                  )}
                >
                  <span className="mr-1.5 font-mono text-[10px] text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </button>
              ))}
            </div>
          )}
          {loaded && (
            <div className="mc-fade-in mt-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-2 text-xs">
              <div className="text-zinc-300">{loaded.description}</div>
              <div className="mt-1 text-zinc-500">
                <span className="uppercase tracking-wider text-[10.5px]">Expected</span> · {loaded.expected}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,0.8fr)]">
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Title</span>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Northwind — signed renewal" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Document date</span>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Author</span>
              <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="optional" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">Document text</span>
            <textarea
              className={cx(inputCls, "min-h-[140px] resize-y font-mono text-[12px] leading-relaxed")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste an email, contract excerpt, policy update…"
              required
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={running}>
              {running ? "Verifying…" : "Run verification"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={running || (!title && !text && !date && !author)}>
              Clear
            </Button>
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Dot tone="sky" pulse /> scan → extract → retrieve → compare → skeptic → decide · {fmtMs(elapsed)}
              </span>
            )}
            <span className="ml-auto font-mono text-[10.5px] text-zinc-600">{text.length.toLocaleString()} chars</span>
          </div>
          {err && <ErrorBox title="Verification failed" message={err} />}
        </form>
      </div>
    </Panel>
  );
}
