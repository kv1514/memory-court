"use client";

import type { Claim, IngestResult, InjectionScan, TraceStep } from "@/lib/types";
import { factRef, fmtDate, fmtDateTime, fmtMs, pct, shortHash } from "../format";
import { claimStatusTone, roleTone, sevRank, stageTone, traceStatusTone } from "../labels";
import { WritesList } from "../shared";
import { Badge, DOT_TONE, Empty, Icon, Panel, PanelHeader, SectionLabel, Stat, cx } from "../ui";
import { FindingCard } from "./FindingCard";

function TraceStepper({ trace }: { trace: TraceStep[] }) {
  if (trace.length === 0) return <p className="text-xs text-zinc-500">No trace returned.</p>;
  return (
    <ol className="relative">
      {trace.map((s, i) => {
        const tone = traceStatusTone(s.status);
        return (
          <li key={`${s.step}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
            {i < trace.length - 1 && <span aria-hidden className="absolute bottom-0 left-[6.5px] top-4 w-px bg-zinc-800" />}
            <span
              className="relative z-10 mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900"
              title={s.status}
            >
              <span className={cx("h-1.5 w-1.5 rounded-full", DOT_TONE[tone])} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-[68px] shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">{s.step}</span>
                <Badge tone={roleTone(s.role)}>{s.role}</Badge>
                <span className="text-[13px] text-zinc-200">{s.label}</span>
                {s.status !== "ok" && <Badge tone={tone}>{s.status}</Badge>}
                <span className="ml-auto font-mono text-[10.5px] tabular-nums text-zinc-500">{fmtMs(s.ms)}</span>
              </div>
              {s.detail && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">{s.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function InjectionBanner({ scan }: { scan: InjectionScan }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/[0.08] p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-red-200">
        <Icon name="shield" className="text-red-400" />
        Prompt injection detected — document quarantined
        <span className="ml-auto font-mono text-xs text-red-300">score {pct(scan.score)}</span>
      </div>
      <p className="mt-1 text-xs text-red-200/80">
        Instruction-like content was found in an untrusted document. Its claims cannot reach memory without an explicit
        reviewer override.
      </p>
      {(scan.matches ?? []).length > 0 && (
        <ul className="mt-2 space-y-1">
          {scan.matches.map((m, i) => (
            <li key={i} className="rounded border border-red-500/20 bg-zinc-950/60 px-2 py-1.5 font-mono text-[11px]">
              <span className="text-red-300">{m.pattern}</span>
              <span className="text-zinc-500"> @{m.start}–{m.end} </span>
              <span className="break-words text-zinc-300">“{m.excerpt}”</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimsTable({ claims }: { claims: Claim[] }) {
  if (claims.length === 0) return <Empty title="No claims extracted" hint="The extractor found no verifiable claims in this document." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead className="bg-zinc-900/80 text-[10.5px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Claim</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Qualifiers</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {claims.map((c) => {
            const display = c.value?.display ?? c.rawValue;
            const rawDiffers = Boolean(c.rawValue && c.rawValue.trim() !== (display ?? "").trim());
            const q = c.qualifiers ?? {};
            return (
              <tr key={c.id} className="align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-200">{c.subject?.name ?? "—"}</div>
                  <div className="text-zinc-400">{c.predicateLabel}</div>
                  <div className="font-mono text-[10.5px] text-zinc-600">{c.id}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-100">{display}</div>
                  {rawDiffers && <div className="font-mono text-[10.5px] text-zinc-500">raw “{c.rawValue}”</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {q.stage && <Badge tone={stageTone(q.stage)}>{q.stage}</Badge>}
                    {q.contractId && <span className="font-mono text-[10.5px] text-zinc-400">{q.contractId}</span>}
                    {q.scope && <span className="text-zinc-400">{q.scope}</span>}
                  </div>
                  <div className="mt-0.5 text-zinc-500">eff. {fmtDate(c.effectiveFrom ?? c.documentDate)}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono tabular-nums text-zinc-200">{pct(c.confidence)}</div>
                  <div className="font-mono text-[10.5px] text-zinc-500">{c.extractor}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={claimStatusTone(c.status)}>{c.status.replace(/_/g, " ")}</Badge>
                    {c.hedged && <Badge tone="yellow">hedged</Badge>}
                  </div>
                  {c.gbrainFactId && <div className="mt-0.5 font-mono text-[10.5px] text-emerald-300">→ fact {factRef(c.gbrainFactId)}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RunView({ run }: { run: IngestResult }) {
  const doc = run.document;
  const claims = run.claims ?? [];
  const trace = run.trace ?? [];
  const committed = run.committed ?? [];
  const reviewItems = run.reviewItems ?? [];
  const findings = [...(run.findings ?? [])].sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const totalMs = trace.reduce((s, t) => s + (Number.isFinite(t.ms) ? t.ms : 0), 0);
  const okWrites = committed.filter((w) => w.ok).length;

  return (
    <Panel className="mc-fade-in">
      <PanelHeader
        title="Verification run"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-zinc-400">{run.runId}</span>
            <span>· {fmtDateTime(doc?.receivedAt)}</span>
            <span>· {fmtMs(totalMs)} total</span>
          </span>
        }
        right={doc?.injection?.flagged ? <Badge tone="red">QUARANTINED</Badge> : <Badge tone="zinc">untrusted input</Badge>}
      />
      <div className="space-y-5 p-4">
        {doc && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
            <span className="text-sm font-medium text-zinc-100">{doc.title}</span>
            <Badge tone={stageTone(doc.stage)}>{doc.stage}</Badge>
            <span className="font-mono text-zinc-500">{doc.id}</span>
            {doc.documentDate && <span>dated {fmtDate(doc.documentDate)}</span>}
            {doc.author && <span>by {doc.author}</span>}
            <span className="font-mono text-zinc-600" title={doc.sha256}>
              sha256 {shortHash(doc.sha256, 12)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Claims" value={claims.length} />
          <Stat label="Findings" value={findings.length} />
          <Stat label="To review" value={reviewItems.length} tone={reviewItems.length > 0 ? "amber" : undefined} />
          <Stat label="GBrain writes" value={`${okWrites}/${committed.length}`} tone={committed.length > 0 ? "emerald" : undefined} />
        </div>

        {doc?.injection?.flagged && <InjectionBanner scan={doc.injection} />}

        <section>
          <SectionLabel>Pipeline trace</SectionLabel>
          <TraceStepper trace={trace} />
        </section>

        <section>
          <SectionLabel right={<span className="font-mono text-[10.5px] text-zinc-500">{claims.length}</span>}>Extracted claims</SectionLabel>
          <ClaimsTable claims={claims} />
        </section>

        <section>
          <SectionLabel right={<span className="font-mono text-[10.5px] text-zinc-500">{findings.length}</span>}>
            Findings · researcher &amp; skeptic
          </SectionLabel>
          {findings.length === 0 ? (
            <p className="text-xs text-zinc-500">No findings raised.</p>
          ) : (
            <div className="space-y-3">
              {findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionLabel>Committed to GBrain (auto-safe facts)</SectionLabel>
          <WritesList writes={committed} emptyText="Nothing auto-committed — every claim was held, corroborated or sent to review." />
          {reviewItems.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300/90">
              <Icon name="arrow" />
              {reviewItems.length} disputed claim{reviewItems.length === 1 ? "" : "s"} sent to the review queue — nothing
              was written for {reviewItems.length === 1 ? "it" : "them"}.
            </p>
          )}
        </section>
      </div>
    </Panel>
  );
}
