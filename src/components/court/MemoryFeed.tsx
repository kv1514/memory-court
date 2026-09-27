"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MemoriesResponse, MemoryFact } from "@/lib/types";
import { relTime } from "../format";
import { useNow } from "../hooks";
import { FactCard } from "../shared";
import { Badge, Button, Dot, Empty, ErrorBox, Loading, Panel, PanelHeader, Toggle } from "../ui";

function sortFacts(a: MemoryFact, b: MemoryFact): number {
  const ea = a.expiredAt ? 1 : 0;
  const eb = b.expiredAt ? 1 : 0;
  if (ea !== eb) return ea - eb;
  const da = a.validFrom ?? a.createdAt ?? "";
  const db = b.validFrom ?? b.createdAt ?? "";
  return db.localeCompare(da);
}

export function MemoryFeed({
  data,
  error,
  onReset,
  resetting,
}: {
  data: MemoriesResponse | null;
  error: string | null;
  onReset: () => void;
  resetting: boolean;
}) {
  const [showExpired, setShowExpired] = useState(false);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const seenRef = useRef<Set<string> | null>(null);
  const now = useNow(5000);

  // Briefly highlight facts that appeared (or changed state) since the previous poll.
  useEffect(() => {
    if (!data) return;
    const keys = (data.memories ?? []).map((f) => `${f.factId}|${f.expiredAt ? "x" : "a"}`);
    if (seenRef.current === null) {
      seenRef.current = new Set(keys);
      return;
    }
    const seen = seenRef.current;
    const added = keys.filter((k) => !seen.has(k));
    keys.forEach((k) => seen.add(k));
    if (added.length > 0) {
      const t = Date.now();
      setFresh((prev) => {
        const next = { ...prev };
        for (const k of added) next[k.split("|")[0]] = t;
        return next;
      });
    }
  }, [data]);

  useEffect(() => {
    if (Object.keys(fresh).length === 0) return;
    const id = window.setTimeout(() => {
      const cutoff = Date.now() - 3000;
      setFresh((prev) => Object.fromEntries(Object.entries(prev).filter(([, v]) => v > cutoff)));
    }, 3200);
    return () => window.clearTimeout(id);
  }, [fresh]);

  const memories = useMemo(() => data?.memories ?? [], [data]);
  const activeCount = memories.filter((f) => !f.expiredAt).length;
  const expiredCount = memories.length - activeCount;

  const groups = useMemo(() => {
    const names = new Map((data?.entities ?? []).map((e) => [e.slug, e.name]));
    const visible = memories.filter((f) => showExpired || !f.expiredAt);
    const bySlug = new Map<string, MemoryFact[]>();
    for (const f of visible) {
      const key = f.entitySlug ?? "__unscoped";
      const list = bySlug.get(key);
      if (list) list.push(f);
      else bySlug.set(key, [f]);
    }
    const order = [
      ...(data?.entities ?? []).map((e) => e.slug),
      ...[...bySlug.keys()].filter((k) => k !== "__unscoped" && !names.has(k)).sort(),
      "__unscoped",
    ];
    return order
      .filter((slug, i) => bySlug.has(slug) && order.indexOf(slug) === i)
      .map((slug) => ({
        slug,
        name: slug === "__unscoped" ? "Unscoped facts" : names.get(slug) ?? slug,
        facts: [...(bySlug.get(slug) ?? [])].sort(sortFacts),
      }));
  }, [data, memories, showExpired]);

  return (
    <Panel className="flex h-full max-h-[75vh] flex-col xl:max-h-none">
      <PanelHeader
        title="Agent memory · GBrain"
        subtitle={
          <span className="flex items-center gap-1.5">
            <Dot tone={error ? "rose" : data ? "emerald" : "zinc"} />
            Source: GBrain recall (live)
            {data?.fetchedAt && <span className="text-zinc-600">· {relTime(data.fetchedAt, now)}</span>}
          </span>
        }
        right={
          <Badge tone="emerald" title="Active facts">
            {activeCount} active
          </Badge>
        }
      />
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 px-4 py-2">
        <Toggle
          checked={showExpired}
          onChange={setShowExpired}
          label={
            <span>
              Show expired <span className="text-zinc-600">({expiredCount})</span>
            </span>
          }
        />
        <span className="font-mono text-[10.5px] text-zinc-600">{data?.source ?? "gbrain.recall"}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {error && <ErrorBox title="GBrain recall failed" message={error} />}
        {!data && !error && <Loading label="Recalling memories from GBrain…" />}
        {data && memories.length === 0 && (
          <Empty
            title="No memories yet — Reset demo to seed"
            hint="Reset wipes the demo brain and seeds the baseline facts the scenarios verify against."
            action={
              <Button size="sm" onClick={onReset} loading={resetting}>
                Reset demo
              </Button>
            }
          />
        )}
        {data && memories.length > 0 && groups.length === 0 && (
          <Empty title="All facts are expired" hint="Toggle “Show expired” to see GBrain's forgotten facts." />
        )}
        {groups.map((g) => (
          <div key={g.slug}>
            <div className="sticky top-0 z-10 -mx-3 mb-1.5 flex items-center justify-between bg-zinc-900/95 px-3 py-1 backdrop-blur">
              <h3 className="text-[13px] font-medium text-zinc-100">{g.name}</h3>
              <span className="font-mono text-[10.5px] text-zinc-500">{g.slug === "__unscoped" ? "" : g.slug}</span>
            </div>
            <div className="space-y-1.5">
              {g.facts.map((f) => (
                <FactCard key={`${f.factId}-${f.expiredAt ? "x" : "a"}`} fact={f} flash={Boolean(fresh[f.factId])} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
