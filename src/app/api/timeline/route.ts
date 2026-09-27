import type { TimelineEntry, TimelineResponse } from "@/lib/types";
import * as gb from "@/lib/gbrain/client";
import { db } from "@/lib/store";
import { registryEntity } from "@/lib/entities";
import { handle } from "@/lib/http";

export async function GET(req: Request) {
  return handle(async (): Promise<TimelineResponse> => {
    const slug = new URL(req.url).searchParams.get("entity");
    if (!slug) throw new Error("entity query parameter is required");
    const s = db();
    const entries: TimelineEntry[] = [];
    const claims = Object.values(s.claims).filter((c) => c.subject.slug === slug);
    for (const c of claims) {
      const doc = s.documents[c.documentId];
      entries.push({ at: c.observedAt, kind: "observed", summary: `Observed ${c.predicateLabel} = ${c.value.display} in "${doc?.title ?? c.documentId}" (${c.qualifiers.stage ?? "unknown"}${c.effectiveFrom ? `, effective ${c.effectiveFrom}` : ""})`, claimId: c.id, source: doc?.title });
      if (c.gbrainFactId && ["committed", "superseded", "historical"].includes(c.status)) {
        entries.push({ at: c.observedAt, kind: "committed", summary: `Written to GBrain as fact #${c.gbrainFactId}${c.status === "superseded" ? " — later superseded by a correction" : c.status === "historical" ? ` — retained as history${c.effectiveTo ? ` (valid until ${c.effectiveTo})` : ""}` : ""}`, claimId: c.id, factId: c.gbrainFactId });
      }
    }
    for (const r of Object.values(s.reviews)) {
      const c = s.claims[r.claimId];
      if (!c || c.subject.slug !== slug || !r.decision) continue;
      const kind = r.decision.action === "approve_correction" ? "corrected" : r.decision.action === "retain_both" ? "retained" : "rejected";
      entries.push({ at: r.decision.at, kind, summary: `${r.decision.reviewer} ${r.decision.action.replace("_", " ")}: ${r.title}${r.decision.note ? ` — "${r.decision.note}"` : ""}`, claimId: c.id, reviewId: r.id, factId: c.gbrainFactId });
    }
    try {
      const tl = (await gb.getTimeline(slug)) as { date: string; summary: string; source?: string; created_at?: string }[];
      for (const e of Array.isArray(tl) ? tl : []) entries.push({ at: e.created_at ?? e.date, kind: "gbrain_timeline", summary: e.summary, source: e.source });
    } catch {
      /* entity page may not exist yet */
    }
    entries.sort((a, b) => a.at.localeCompare(b.at));
    return { entity: { slug, name: registryEntity(slug)?.name ?? slug }, entries };
  });
}
