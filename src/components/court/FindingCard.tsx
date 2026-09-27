"use client";

import type { Evidence, Finding } from "@/lib/types";
import { clamp01, factRef, fmtDate } from "../format";
import { actionLabelFor, findingLabel, findingTone, sevBorder, sevTone, stageTone } from "../labels";
import { Badge, Dot, Meter, cx, type Tone } from "../ui";

export function RaisedBy({ role }: { role: string }) {
  const tone: Tone = role === "skeptic" ? "violet" : role === "researcher" ? "sky" : "zinc";
  return (
    <Badge tone={tone} className="tracking-wider">
      {role.toUpperCase()}
    </Badge>
  );
}

function EvidenceColumn({ side, items }: { side: "incoming" | "memory"; items: Evidence[] }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">
        <Dot tone={side === "incoming" ? "sky" : "emerald"} />
        {side === "incoming" ? "Incoming document" : "Memory · GBrain"}
      </div>
      {items.map((e, i) => (
        <div key={i} className={cx(i > 0 && "mt-2 border-t border-zinc-800 pt-2")}>
          {e.valueDisplay && <div className="text-[15px] font-semibold text-zinc-50">{e.valueDisplay}</div>}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
            {e.documentTitle && <span className="text-zinc-300">{e.documentTitle}</span>}
            {e.stage && <Badge tone={stageTone(e.stage)}>{e.stage}</Badge>}
            {e.date && <span>{fmtDate(e.date)}</span>}
            {e.gbrainFactId && <span className="font-mono text-emerald-300">fact {factRef(e.gbrainFactId)}</span>}
            {e.claimId && <span className="font-mono text-zinc-500">{e.claimId}</span>}
          </div>
          {e.excerpt && (
            <blockquote className="mt-1.5 whitespace-pre-wrap break-words rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-300">
              “{e.excerpt}”
            </blockquote>
          )}
          {e.provenance && (
            <div className="mt-1 truncate font-mono text-[10.5px] text-zinc-500" title={e.provenance}>
              {e.provenance}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FindingCard({ finding: f, compact = false }: { finding: Finding; compact?: boolean }) {
  const evidence = f.evidence ?? [];
  const incoming = evidence.filter((e) => e.side === "incoming");
  const memory = evidence.filter((e) => e.side === "memory");
  const checks = f.checks ?? [];
  const rationale = f.rationale ?? [];
  const u = clamp01(f.uncertainty);
  const uTone: Tone = u < 0.25 ? "emerald" : u < 0.55 ? "amber" : "rose";
  const passed = checks.filter((c) => c.passed).length;

  return (
    <article
      className={cx(
        "mc-fade-in overflow-hidden rounded-lg border border-l-2 border-zinc-800 bg-zinc-950/40",
        sevBorder(f.severity),
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
        <Badge tone={findingTone(f.type)}>{findingLabel(f.type)}</Badge>
        <Badge tone={sevTone(f.severity)}>{f.severity}</Badge>
        <RaisedBy role={f.raisedBy} />
        <span className="ml-auto font-mono text-[10.5px] text-zinc-500">{f.id}</span>
      </header>
      <h4 className="px-3 pt-2 text-sm font-medium leading-snug text-zinc-100">{f.title}</h4>

      {(incoming.length > 0 || memory.length > 0) && (
        <div className="px-3 pt-3">
          <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">Evidence comparison</div>
          <div className={cx("grid gap-2", incoming.length > 0 && memory.length > 0 && !compact && "sm:grid-cols-2")}>
            {incoming.length > 0 && <EvidenceColumn side="incoming" items={incoming} />}
            {memory.length > 0 && <EvidenceColumn side="memory" items={memory} />}
          </div>
        </div>
      )}

      {rationale.length > 0 && (
        <div className="px-3 pt-3">
          <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">Rationale</div>
          <ul className="space-y-1 text-xs leading-relaxed text-zinc-300">
            {rationale.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {checks.length > 0 && (
        <div className="px-3 pt-3">
          <div className="mb-1 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">
            <span>Checks</span>
            <span className="font-mono normal-case tracking-normal">
              {passed}/{checks.length} passed
            </span>
          </div>
          <ul className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 px-2 py-1.5 text-xs">
                <span
                  aria-label={c.passed ? "passed" : "failed"}
                  className={cx("mt-px w-3 shrink-0 text-center font-semibold", c.passed ? "text-emerald-400" : "text-rose-400")}
                >
                  {c.passed ? "✓" : "✗"}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] text-zinc-200">{c.name}</span>
                  {c.detail && <span className="ml-2 text-zinc-400">{c.detail}</span>}
                </div>
                <span
                  className={cx(
                    "shrink-0 rounded px-1 py-px text-[10px] uppercase tracking-wide ring-1 ring-inset",
                    c.deterministic ? "text-zinc-400 ring-zinc-700" : "text-violet-300 ring-violet-500/30",
                  )}
                >
                  {c.deterministic ? "deterministic" : "LLM"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 px-3 py-2">
        <div className="flex items-center gap-2" title="0% = certain, 100% = no idea. Derived from failed/contested checks.">
          <span className="text-[10.5px] uppercase tracking-wider text-zinc-500">Uncertainty</span>
          <Meter value={u} tone={uTone} className="w-20" />
          <span className="font-mono text-xs tabular-nums text-zinc-300">{Math.round(u * 100)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Recommended</span>
          <span className="rounded-md bg-zinc-100/10 px-1.5 py-0.5 font-medium text-zinc-100 ring-1 ring-inset ring-zinc-500/40">
            {actionLabelFor(f.recommendedAction, f.type)}
          </span>
        </div>
      </footer>
    </article>
  );
}
