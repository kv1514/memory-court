"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineResponse } from "@/lib/types";
import { apiGet, errMsg } from "./api";
import { factRef, fmtDateTime } from "./format";
import { timelineMeta } from "./labels";
import { Badge, Button, Empty, ErrorBox, Icon, Loading, Panel, PanelHeader, RING_TONE, TEXT_TONE, cx } from "./ui";

export function TimelineTab({
  entities,
  refreshKey,
  active,
}: {
  entities: { slug: string; name: string }[];
  refreshKey: number;
  active: boolean;
}) {
  const [picked, setSlug] = useState("");
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqRef = useRef(0);

  const slug = picked && entities.some((e) => e.slug === picked) ? picked : entities[0]?.slug ?? "";

  const load = useCallback(async (s: string) => {
    if (!s) return;
    const n = ++reqRef.current;
    setLoading(true);
    try {
      const r = await apiGet<TimelineResponse>(`/api/timeline?entity=${encodeURIComponent(s)}`);
      if (n !== reqRef.current) return;
      setData(r);
      setErr(null);
    } catch (e) {
      if (n !== reqRef.current) return;
      setErr(errMsg(e));
    } finally {
      if (n === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active || !slug) return;
    const t = window.setTimeout(() => void load(slug), 0);
    return () => window.clearTimeout(t);
  }, [active, slug, refreshKey, load]);

  const entries = data && data.entity?.slug === slug ? data.entries ?? [] : [];
  const sorted = [...entries].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Panel>
        <PanelHeader
          title="Revision timeline"
          subtitle="Every observation, commit, correction and rejection for an entity — plus GBrain's own page timeline."
          right={
            <Button size="sm" variant="ghost" onClick={() => void load(slug)} disabled={!slug} loading={loading}>
              <Icon name="refresh" /> Refresh
            </Button>
          }
        />
        <div className="p-4">
          {entities.length === 0 ? (
            <p className="text-xs text-zinc-500">No entities in memory yet — Reset demo to seed.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Entity">
              {entities.map((e) => (
                <button
                  key={e.slug}
                  type="button"
                  role="radio"
                  aria-checked={slug === e.slug}
                  onClick={() => setSlug(e.slug)}
                  className={cx(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors duration-150",
                    slug === e.slug
                      ? "border-zinc-500 bg-zinc-100/10 text-zinc-50"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  )}
                >
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {err && <ErrorBox title="Could not load timeline" message={err} />}
      {slug && !data && loading && <Loading label="Loading timeline…" />}

      {data && data.entity?.slug === slug && (
        <Panel className="mc-fade-in">
          <PanelHeader
            title={data.entity.name}
            subtitle={<span className="font-mono">{data.entity.slug}</span>}
            right={<Badge tone="zinc">{sorted.length} entries</Badge>}
          />
          <div className="p-5">
            {sorted.length === 0 ? (
              <Empty title="No history yet for this entity" hint="Submit a document that mentions it on the Court tab." />
            ) : (
              <ol className="relative">
                {sorted.map((e, i) => {
                  const meta = timelineMeta(e.kind);
                  return (
                    <li key={`${e.at}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
                      {i < sorted.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13px] top-7 w-px bg-zinc-800" />}
                      <span
                        className={cx(
                          "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                          RING_TONE[meta.tone],
                        )}
                      >
                        <Icon name={meta.icon} className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cx("text-xs font-medium", TEXT_TONE[meta.tone])}>{meta.label}</span>
                          <span className="font-mono text-[10.5px] text-zinc-500">{fmtDateTime(e.at)}</span>
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-zinc-200">{e.summary}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-zinc-500">
                          {e.factId && <span className="text-emerald-300/80">fact {factRef(e.factId)}</span>}
                          {e.claimId && <span>{e.claimId}</span>}
                          {e.reviewId && <span>{e.reviewId}</span>}
                          {e.source && <span className="truncate" title={e.source}>{e.source}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
