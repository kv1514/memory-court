"use client";

import { useMemo, useState } from "react";
import type {
  DecisionRequest,
  DecisionResponse,
  GbrainWrite,
  ReviewAction,
  ReviewItemView,
  ReviewsResponse,
} from "@/lib/types";
import { apiPost, errMsg } from "../api";
import { factRef, fmtDate, fmtDateTime, fmtTime, pct, stripMcTag } from "../format";
import { actionLabel, findingLabel, findingTone, reviewStatusTone, sevRank, sevTone, stageTone } from "../labels";
import { WritesList } from "../shared";
import { Badge, Button, Dot, Empty, ErrorBox, Icon, Loading, Panel, PanelHeader, cx, inputCls } from "../ui";
import { FindingCard } from "./FindingCard";

const ACTION_ORDER: ReviewAction[] = ["approve_correction", "retain_both", "reject"];

function ValuePair({ item }: { item: ReviewItemView }) {
  const memClaim = item.memoryClaim;
  const memFact = item.memoryFact;
  // mc.value is a machine token; prefer the structured claim, else fall back to the fact sentence.
  const memVal = memClaim?.value?.display ?? null;
  const memText = memFact ? stripMcTag(memFact.text) : null;
  const memId = item.gbrainFactId ?? memFact?.factId ?? memClaim?.gbrainFactId;
  const memStage = memClaim?.qualifiers?.stage ?? memFact?.mc?.stage;
  const memDate = memClaim?.effectiveFrom ?? memClaim?.documentDate ?? memFact?.validFrom ?? null;
  const hasMem = Boolean(memVal || memText || memId);
  const claim = item.claim;
  const doc = item.document;

  return (
    <div className={cx("grid gap-2", hasMem && "grid-cols-2")}>
      {hasMem && (
        <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">
            <Dot tone="emerald" /> In memory
            {memId && <span className="ml-auto font-mono normal-case tracking-normal text-emerald-300">{factRef(memId)}</span>}
          </div>
          <div className={cx(memVal ? "text-sm font-semibold text-zinc-100" : "text-xs text-zinc-200")}>{memVal ?? memText ?? "—"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
            {memStage && <Badge tone={stageTone(memStage)}>{memStage}</Badge>}
            {memDate && <span>{fmtDate(memDate)}</span>}
            {memFact?.expiredAt && <Badge tone="zinc">expired</Badge>}
          </div>
          {memText && memVal && (
            <div className="mt-1 line-clamp-2 text-[11px] text-zinc-400" title={memFact?.text}>
              {memText}
            </div>
          )}
        </div>
      )}
      <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">
          <Dot tone="sky" /> Incoming claim
          {claim?.id && <span className="ml-auto font-mono normal-case tracking-normal text-zinc-500">{claim.id}</span>}
        </div>
        <div className="text-sm font-semibold text-zinc-100">{claim?.value?.display ?? claim?.rawValue ?? "—"}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
          {doc?.stage && <Badge tone={stageTone(doc.stage)}>{doc.stage}</Badge>}
          {(claim?.effectiveFrom ?? doc?.documentDate) && <span>{fmtDate(claim?.effectiveFrom ?? doc?.documentDate)}</span>}
        </div>
        {doc?.title && (
          <div className="mt-1 truncate text-[11px] text-zinc-400" title={doc.title}>
            {doc.title}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingCard({
  item,
  reviewer,
  onDecided,
}: {
  item: ReviewItemView;
  reviewer: string;
  onDecided: (id: string, r: DecisionResponse) => void;
}) {
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const flagged = Boolean(item.document?.injection?.flagged);
  const allowed = item.allowedActions ?? [];
  const actions = [...ACTION_ORDER.filter((a) => allowed.includes(a)), ...allowed.filter((a) => !ACTION_ORDER.includes(a))];
  const needsOverride = (a: ReviewAction) => flagged && a !== "reject";
  const findings = item.findings ?? [];

  const act = async (action: ReviewAction) => {
    if (needsOverride(action) && !override) return;
    setBusy(action);
    setErr(null);
    try {
      const body: DecisionRequest = { action };
      if (note.trim()) body.note = note.trim();
      if (reviewer.trim()) body.reviewer = reviewer.trim();
      if (needsOverride(action)) body.overrideQuarantine = true;
      const r = await apiPost<DecisionResponse>(`/api/reviews/${encodeURIComponent(item.id)}/decision`, body);
      onDecided(item.id, r);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="mc-fade-in rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={findingTone(item.classification)}>{findingLabel(item.classification)}</Badge>
        <Badge tone={sevTone(item.severity)}>{item.severity}</Badge>
        {flagged && <Badge tone="red">quarantined</Badge>}
        <span className="ml-auto font-mono text-[10.5px] text-zinc-500">{item.id}</span>
      </div>
      <h4 className="mt-2 text-sm font-medium leading-snug text-zinc-100">{item.title}</h4>
      <div className="mt-0.5 text-[11px] text-zinc-500">
        {item.claim?.subject?.name} · {item.claim?.predicateLabel} · opened {fmtTime(item.createdAt)}
      </div>

      <div className="mt-2.5">
        <ValuePair item={item} />
      </div>

      <div className="mt-2.5 flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Recommended</span>
        <span className="rounded-md bg-zinc-100/10 px-1.5 py-0.5 font-medium text-zinc-100 ring-1 ring-inset ring-zinc-500/40">
          {actionLabel(item.recommended)}
        </span>
      </div>

      {flagged && (
        <div role="alert" className="mt-2.5 rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">
          <div className="flex items-center gap-1.5 font-medium">
            <Icon name="alert" className="text-red-400" />
            Source flagged for prompt injection (score {pct(item.document.injection.score)})
          </div>
          <p className="mt-1 text-red-200/80">
            Accepting this claim writes content from an instruction-bearing, untrusted document into agent memory.
          </p>
          <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-3.5 w-3.5 accent-red-500"
            />
            Override quarantine — I verified this claim independently
          </label>
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reviewer note (optional, stored in the audit log)"
        rows={2}
        className={cx(inputCls, "mt-2.5 resize-y text-xs")}
      />

      <div className="mt-2 flex flex-wrap gap-2">
        {actions.length === 0 && <span className="text-xs text-zinc-500">No actions allowed for this item.</span>}
        {actions.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === item.recommended ? "primary" : a === "reject" ? "danger" : "secondary"}
            loading={busy === a}
            disabled={busy !== null || (needsOverride(a) && !override)}
            title={needsOverride(a) && !override ? "Tick “Override quarantine” first" : undefined}
            onClick={() => void act(a)}
          >
            {actionLabel(a)}
          </Button>
        ))}
      </div>
      {err && <ErrorBox className="mt-2" title="Decision failed" message={err} />}

      {findings.length > 0 && (
        <details className="group mt-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
            <Icon name="chevron" className="h-3 w-3 transition-transform duration-150 group-open:rotate-90" />
            Evidence &amp; checks ({findings.length} finding{findings.length === 1 ? "" : "s"})
          </summary>
          <div className="mt-2 space-y-2">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} compact />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function DecidedCard({ item, writes, open }: { item: ReviewItemView; writes?: GbrainWrite[]; open?: boolean }) {
  const d = item.decision;
  const w = writes ?? d?.writes ?? [];
  const failed = w.filter((x) => !x.ok).length;
  return (
    <details open={open} className="group mc-fade-in rounded-lg border border-zinc-800 bg-zinc-950/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden">
        <Icon name="chevron" className="h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-150 group-open:rotate-90" />
        <Badge tone={reviewStatusTone(item.status)}>{item.status}</Badge>
        <span className="min-w-0 flex-1 truncate text-zinc-300">{item.title}</span>
        {failed > 0 && <Badge tone="rose">{failed} write failed</Badge>}
        <span className="shrink-0 text-zinc-500">{fmtTime(d?.at)}</span>
      </summary>
      <div className="space-y-2.5 border-t border-zinc-800 px-3 py-2.5 text-xs">
        {d ? (
          <div className="text-zinc-400">
            <span className="font-medium text-zinc-200">{actionLabel(d.action)}</span> by{" "}
            <span className="text-zinc-200">{d.reviewer || "—"}</span> · {fmtDateTime(d.at)}
            {d.note && <div className="mt-1 italic text-zinc-400">“{d.note}”</div>}
          </div>
        ) : (
          <div className="text-zinc-500">Decision details unavailable.</div>
        )}
        <ValuePair item={item} />
        <div>
          <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">GBrain writes</div>
          <WritesList writes={w} emptyText="No GBrain writes for this decision." />
        </div>
      </div>
    </details>
  );
}

export function ReviewQueue({
  data,
  error,
  onDecided,
}: {
  data: ReviewsResponse | null;
  error: string | null;
  onDecided: () => void;
}) {
  const [reviewer, setReviewer] = useState("");
  const [local, setLocal] = useState<Record<string, DecisionResponse>>({});
  const [lastDecided, setLastDecided] = useState<string | null>(null);

  const items = useMemo(
    () =>
      (data?.items ?? []).map((i) => {
        const d = local[i.id];
        return d && i.status === "pending" && d.item ? d.item : i;
      }),
    [data, local],
  );
  const pending = items
    .filter((i) => i.status === "pending")
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const decided = items
    .filter((i) => i.status !== "pending")
    .sort((a, b) => (b.decision?.at ?? b.createdAt ?? "").localeCompare(a.decision?.at ?? a.createdAt ?? ""));

  const handleDecided = (id: string, r: DecisionResponse) => {
    setLocal((prev) => ({ ...prev, [id]: r }));
    setLastDecided(id);
    onDecided();
  };

  return (
    <Panel className="flex h-full max-h-[80vh] flex-col xl:max-h-none">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            Review queue
            <span
              className={cx(
                "rounded-full px-1.5 py-px font-mono text-[10.5px] normal-case tracking-normal",
                pending.length > 0 ? "bg-amber-500/15 text-amber-300" : "bg-zinc-800 text-zinc-400",
              )}
            >
              {pending.length}
            </span>
          </span>
        }
        subtitle="Disputed claims wait here. Nothing reaches GBrain without a decision."
      />
      <div className="flex items-center gap-2 border-b border-zinc-800/60 px-4 py-2">
        <label htmlFor="mc-reviewer" className="text-[11px] text-zinc-500">
          Reviewer
        </label>
        <input
          id="mc-reviewer"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="your name (optional)"
          className={cx(inputCls, "h-7 py-1 text-xs")}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {error && <ErrorBox title="Could not load reviews" message={error} />}
        {!data && !error && <Loading label="Loading review queue…" />}
        {data && pending.length === 0 && (
          <Empty
            title="Queue is clear"
            hint="Contradictions, stale documents and injection-flagged claims land here for a human decision."
          />
        )}
        {pending.map((i) => (
          <PendingCard key={i.id} item={i} reviewer={reviewer} onDecided={handleDecided} />
        ))}
        {decided.length > 0 && (
          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <span>Decided</span>
              <span className="font-mono normal-case tracking-normal">{decided.length}</span>
            </div>
            <div className="space-y-1.5">
              {decided.map((i) => (
                <DecidedCard
                  key={i.id}
                  item={i}
                  writes={local[i.id]?.writes}
                  open={i.id === lastDecided}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
