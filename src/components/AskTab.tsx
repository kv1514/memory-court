"use client";

import { useState, type FormEvent } from "react";
import type { AskResponse } from "@/lib/types";
import { apiPost, errMsg } from "./api";
import { factRef, fmtDateTime, fmtMs, safeJson } from "./format";
import { useElapsed } from "./hooks";
import { FactCard } from "./shared";
import { Badge, Button, Dot, Empty, ErrorBox, Icon, Panel, PanelHeader, SectionLabel, cx, inputCls } from "./ui";

const SUGGESTIONS = [
  "What is Northwind Logistics' annual contract value?",
  "What did Helios Dental agree to pay?",
  "What is Contoso Retail's refund window?",
];

export function AskTab() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [fresh, setFresh] = useState(false);
  const elapsed = useElapsed(loading);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading) return;
    setQuestion(text);
    setLoading(true);
    setErr(null);
    try {
      setRes(await apiPost<AskResponse>("/api/ask", { question: text, fresh }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  const history = res?.history ?? [];
  const expiredCount = history.filter((f) => f.expiredAt).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Panel>
        <PanelHeader
          title="Ask the agent"
          subtitle="Answers are read back from GBrain via MCP recall — the agent's memory, after Memory Court's verification."
        />
        <div className="space-y-3 p-4">
          <form onSubmit={onSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about a customer, contract or policy…"
                className={cx(inputCls, "h-9 pl-8")}
              />
            </div>
            <Button type="submit" variant="primary" className="h-9" loading={loading} disabled={!question.trim()}>
              Ask
            </Button>
          </form>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="accent-emerald-500" />
            Restart the GBrain MCP server process before answering (proves the answer is read from GBrain&apos;s persisted brain, not app state)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => void ask(s)}
                className="rounded-full border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 text-xs text-zinc-300 transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-800/60 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Dot tone="sky" pulse /> Calling GBrain recall… {fmtMs(elapsed)}
            </div>
          )}
          {err && <ErrorBox title="Ask failed" message={err} />}
        </div>
      </Panel>

      {!res && !loading && !err && (
        <Empty
          title="Ask a question to query the agent's memory"
          hint="Try a suggestion before and after resolving a review: the answer changes only once a verified fact is committed to GBrain."
        />
      )}

      {res && (
        <div key={`${res.question}-${res.retrieval?.at}`} className="mc-fade-in space-y-4">
          <Panel>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                <span className="mr-1 italic text-zinc-400">“{res.question}”</span>
                {res.entity && <Badge tone="zinc">{res.entity.name}</Badge>}
                {res.predicate && <Badge tone="zinc">{res.predicate.label}</Badge>}
              </div>
              <div className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-zinc-50">{res.answer}</div>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-xs text-emerald-200">
                <Icon name="database" className="text-emerald-400" />
                <span>
                  Retrieved from GBrain via MCP <span className="font-mono">{res.retrieval?.tool ?? "recall"}</span> ·{" "}
                  {res.retrieval?.factCount ?? 0} facts · {fmtMs(res.retrieval?.ms)}
                </span>
                <span className="text-emerald-300/60">{fmtDateTime(res.retrieval?.at)}</span>
                {res.retrieval?.freshProcess && (
                  <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[10.5px] text-emerald-300">
                    fresh gbrain serve process{res.retrieval.serverPid ? ` · pid ${res.retrieval.serverPid}` : ""}
                  </span>
                )}
                {res.retrieval?.args && (
                  <code className="w-full truncate font-mono text-[10.5px] text-emerald-300/70" title={safeJson(res.retrieval.args, 2)}>
                    recall({safeJson(res.retrieval.args)})
                  </code>
                )}
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Current fact"
                right={res.current ? <span className="font-mono text-xs text-zinc-300">{factRef(res.current.factId)}</span> : undefined}
              />
              <div className="space-y-2 p-4">
                {res.current ? (
                  <>
                    <FactCard fact={res.current} highlight />
                    <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-zinc-500">GBrain fact</dt>
                      <dd className="font-mono text-zinc-200">{factRef(res.current.factId)}</dd>
                      <dt className="text-zinc-500">Provenance</dt>
                      <dd className="break-words font-mono text-zinc-300">{res.current.provenance ?? "—"}</dd>
                      {res.current.mc?.claimId && (
                        <>
                          <dt className="text-zinc-500">Claim</dt>
                          <dd className="font-mono text-zinc-300">{res.current.mc.claimId}</dd>
                        </>
                      )}
                    </dl>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">No active fact in GBrain answers this question.</p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Reasoning" />
              <div className="p-4">
                {(res.reasoning ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500">No reasoning returned.</p>
                ) : (
                  <ol className="space-y-1.5 text-xs leading-relaxed text-zinc-300">
                    {res.reasoning.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="w-4 shrink-0 font-mono text-[10.5px] text-zinc-500">{i + 1}.</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="History in GBrain"
              subtitle="Other matching facts, including ones GBrain has expired or superseded."
              right={expiredCount > 0 ? <Badge tone="zinc">{expiredCount} expired</Badge> : undefined}
            />
            <div className="p-4">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-500">No other matching facts.</p>
              ) : (
                <div className="space-y-1.5">
                  <SectionLabel>{history.length} fact{history.length === 1 ? "" : "s"}</SectionLabel>
                  {history.map((f) => (
                    <FactCard key={`${f.factId}-${f.expiredAt ?? "a"}`} fact={f} />
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
