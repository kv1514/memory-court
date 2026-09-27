"use client";

import type { GbrainWrite, MemoryFact } from "@/lib/types";
import { factRef, fmtDate, pct, resultId, safeJson, stripMcTag } from "./format";
import { Badge, Dot, cx } from "./ui";

/** GBrain writes performed by a run or a review decision: op, ok/error, returned id. */
export function WritesList({ writes, emptyText = "No GBrain writes." }: { writes: GbrainWrite[]; emptyText?: string }) {
  if (!writes || writes.length === 0) return <p className="text-xs text-zinc-500">{emptyText}</p>;
  return (
    <ul className="space-y-1">
      {writes.map((w, i) => {
        const id = w.ok ? resultId(w.result) : null;
        return (
          <li
            key={`${w.op}-${i}`}
            title={`args: ${safeJson(w.args)}${w.result !== undefined ? `\nresult: ${safeJson(w.result)}` : ""}`}
            className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-1 font-mono text-[11px]"
          >
            <Dot tone={w.ok ? "emerald" : "rose"} />
            <span className="text-zinc-200">{w.op}</span>
            {w.ok ? (
              <span className="text-emerald-400">ok</span>
            ) : (
              <span className="min-w-0 truncate text-rose-300">{w.error ?? "error"}</span>
            )}
            {id && <span className="ml-auto truncate pl-2 text-zinc-400">→ {id}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** A GBrain fact as returned by `recall`. Expired facts are struck through. */
export function FactCard({
  fact,
  flash,
  entityName,
  highlight,
}: {
  fact: MemoryFact;
  flash?: boolean;
  entityName?: string;
  highlight?: boolean;
}) {
  const expired = Boolean(fact.expiredAt);
  const text = stripMcTag(fact.text);
  return (
    <div
      className={cx(
        "rounded-lg border px-3 py-2.5 transition-colors duration-300",
        expired ? "border-zinc-800/70 bg-zinc-950/30" : highlight ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-zinc-800 bg-zinc-900/80",
        flash && "mc-flash",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          title={fact.text}
          className={cx(
            "text-[13px] leading-5",
            expired ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-200",
          )}
        >
          {text}
        </p>
        {expired ? <Badge tone="zinc">EXPIRED</Badge> : <Badge tone="emerald">ACTIVE</Badge>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
        <span className="font-mono text-zinc-300">{factRef(fact.factId)}</span>
        {entityName && <span className="text-zinc-400">{entityName}</span>}
        <span>{fact.kind}</span>
        {fact.validFrom && <span>valid from {fmtDate(fact.validFrom)}</span>}
        {fact.validUntil && <span>until {fmtDate(fact.validUntil)}</span>}
        {fact.mc?.stage && <Badge tone="zinc">{fact.mc.stage}</Badge>}
        {fact.mc?.contract && <span className="font-mono text-zinc-400">{fact.mc.contract}</span>}
        {fact.confidence !== null && fact.confidence !== undefined && <span>conf {pct(fact.confidence)}</span>}
        {expired && <span className="text-zinc-400">expired in GBrain {fmtDate(fact.expiredAt)}</span>}
        {fact.supersededBy && <span className="text-zinc-400">superseded by {factRef(fact.supersededBy)}</span>}
      </div>
      {fact.provenance && (
        <div className="mt-1 truncate font-mono text-[10.5px] text-zinc-500" title={fact.provenance}>
          {fact.provenance}
        </div>
      )}
    </div>
  );
}
