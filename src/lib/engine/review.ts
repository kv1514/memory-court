// Human review decisions. The ONLY path by which disputed information can change GBrain memory.
// Nothing is silently overwritten: corrections expire the old GBrain fact with a reason (GBrain keeps it
// with an audit trail) and write the new fact with provenance pointing back to the review.
import { z } from "zod";
import type { DecisionResponse, GbrainWrite, ReviewItemView } from "../types";
import * as gb from "../gbrain/client";
import { audit, db, save } from "../store";
import { commitClaim, retrieveMemories } from "./pipeline";

export const DecisionInput = z.object({
  action: z.enum(["approve_correction", "reject", "retain_both"]),
  note: z.string().trim().max(500).optional(),
  reviewer: z.string().trim().max(80).optional(),
  overrideQuarantine: z.boolean().optional(),
});

export class ReviewError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export async function reviewView(id: string): Promise<ReviewItemView> {
  const s = db();
  const item = s.reviews[id];
  if (!item) throw new ReviewError(`Unknown review ${id}`, 404);
  const claim = s.claims[item.claimId];
  const doc = s.documents[claim.documentId];
  let memoryFact;
  if (item.gbrainFactId) {
    const facts = await retrieveMemories(claim.subject.slug, true).catch(() => []);
    memoryFact = facts.find((f) => f.factId === item.gbrainFactId);
  }
  return {
    ...item,
    claim,
    document: { id: doc.id, title: doc.title, stage: doc.stage, documentDate: doc.documentDate, injection: doc.injection },
    memoryClaim: item.memoryClaimId ? s.claims[item.memoryClaimId] : undefined,
    memoryFact,
    findings: item.findingIds.map((f) => s.findings[f]).filter(Boolean),
  };
}

export async function listReviews(): Promise<ReviewItemView[]> {
  const s = db();
  const items = Object.values(s.reviews).sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
  const out: ReviewItemView[] = [];
  for (const it of items) out.push(await reviewView(it.id));
  return out;
}

export async function decide(id: string, input: z.input<typeof DecisionInput>): Promise<DecisionResponse> {
  const d = DecisionInput.parse(input);
  const s = db();
  const item = s.reviews[id];
  if (!item) throw new ReviewError(`Unknown review ${id}`, 404);
  if (item.status !== "pending") throw new ReviewError(`${id} was already decided (${item.status})`, 409);
  if (!item.allowedActions.includes(d.action)) throw new ReviewError(`Action ${d.action} is not allowed for a ${item.classification} review`);
  const claim = s.claims[item.claimId];
  const doc = s.documents[claim.documentId];
  const reviewer = d.reviewer || "reviewer";
  if (doc.injection.flagged && d.action !== "reject" && !d.overrideQuarantine) {
    audit("security", "security.write_denied", `${reviewer} attempted ${d.action} on quarantined ${claim.id} without override`, { reviewId: id, claimId: claim.id });
    throw new ReviewError("This claim comes from a quarantined document (prompt-injection screen). Explicit overrideQuarantine is required.", 403);
  }
  const writes: GbrainWrite[] = [];
  const memoryClaim = item.memoryClaimId ? s.claims[item.memoryClaimId] : undefined;
  const note = `review ${id} (${d.action}) by ${reviewer}${d.note ? `: ${d.note}` : ""}`;

  if (d.action === "approve_correction") {
    if (item.gbrainFactId && ["contradiction", "legitimate_update", "stale_incoming"].includes(item.classification)) {
      const reason = `Memory Court ${id}: corrected by ${reviewer}; superseded by ${claim.id} from "${doc.title}"${d.note ? ` — ${d.note}` : ""}`;
      const w: GbrainWrite = { op: "forget", args: { id: item.gbrainFactId, reason }, ok: true, at: new Date().toISOString() };
      try {
        const r = await gb.forget(item.gbrainFactId, reason);
        w.result = { id: r.id, expired: r.expired };
        audit("gbrain", "gbrain.forget", `forget fact #${item.gbrainFactId} (expired with audit trail, not deleted)`, { reviewId: id, factId: item.gbrainFactId });
      } catch (e) {
        w.ok = false;
        w.error = (e as Error).message;
      }
      writes.push(w);
      if (!w.ok) throw new ReviewError(`GBrain forget failed: ${w.error}`, 502);
      if (memoryClaim) memoryClaim.status = "superseded";
    }
    await commitClaim(claim, doc, `${note}${item.gbrainFactId ? `; supersedes fact #${item.gbrainFactId}` : ""}`, writes);
    claim.status = "committed";
    item.status = "approved";
  } else if (d.action === "retain_both") {
    await commitClaim(claim, doc, `${note}; retained alongside fact #${item.gbrainFactId ?? "n/a"} (circumstances changed)`, writes);
    claim.status = "committed";
    if (memoryClaim) {
      memoryClaim.status = "historical";
      memoryClaim.effectiveTo = claim.effectiveFrom ?? today();
    }
    item.status = "retained";
  } else {
    claim.status = "rejected";
    item.status = "rejected";
    const w: GbrainWrite = { op: "add_timeline_entry", args: { slug: claim.subject.slug }, ok: true, at: new Date().toISOString() };
    try {
      w.result = await gb.addTimelineEntry(
        claim.subject.slug,
        today(),
        `Memory Court rejected an incoming ${claim.predicateLabel} claim (${item.classification})`,
        `${note}. Rejected value: ${doc.injection.flagged ? "[withheld: quarantined source]" : claim.value.display}. Memory unchanged${item.gbrainFactId ? ` (fact #${item.gbrainFactId} kept)` : ""}.`,
        `memory-court:${id}`,
      );
    } catch (e) {
      w.ok = false;
      w.error = (e as Error).message;
    }
    writes.push(w);
  }
  item.decision = { action: d.action, reviewer, note: d.note, at: new Date().toISOString(), writes };
  audit("reviewer", "review.decided", `${reviewer} chose ${d.action} on ${id} (${item.classification})`, { reviewId: id, claimId: claim.id, factId: claim.gbrainFactId }, { writes: writes.map((w) => ({ op: w.op, ok: w.ok, error: w.error })) });
  save();
  return { item: await reviewView(id), writes };
}
