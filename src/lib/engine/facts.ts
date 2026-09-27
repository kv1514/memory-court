// Mapping between Memory Court claims and GBrain facts.
// GBrain facts are free text + provenance; we append a compact machine-readable tag so any agent reading
// the brain sees a normal sentence, while Memory Court can re-derive the structured claim FROM GBRAIN ALONE.
import type { Claim, MemoryFact, SourceDocument } from "../types";
import type { RawFact } from "../gbrain/client";
import { valueFromToken, valueToken } from "../normalize";
import { PREDICATES } from "../extract/rules";

const TAG_RE = /\[mc ([^\]]+)\]/;

export function claimToFactText(c: Claim): string {
  const q: string[] = [];
  if (c.qualifiers.contractId) q.push(`contract ${c.qualifiers.contractId}`);
  if (c.qualifiers.stage && c.qualifiers.stage !== "unknown") q.push(c.qualifiers.stage);
  const eff = c.effectiveFrom ? `effective ${c.effectiveFrom}` : "";
  const lineage = c.qualifiers.scope?.startsWith("supersedes") ? c.qualifiers.scope : "";
  const quals = [q.join(", "), eff, lineage].filter(Boolean).join("; ");
  const tag = [
    `claim=${c.id}`,
    `pred=${c.predicate}`,
    `val=${valueToken(c.value)}`,
    c.qualifiers.stage ? `stage=${c.qualifiers.stage}` : "",
    c.qualifiers.contractId ? `contract=${c.qualifiers.contractId}` : "",
    c.effectiveFrom ? `eff=${c.effectiveFrom}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${c.subject.name} — ${c.predicateLabel}: ${c.value.display}${quals ? ` (${quals})` : ""}. [mc ${tag}]`;
}

export function claimProvenance(c: Claim, doc: SourceDocument, extra?: string): string {
  const excerpt = c.excerpt.length > 140 ? `${c.excerpt.slice(0, 137)}...` : c.excerpt;
  return [
    `memory-court ${c.id}`,
    `doc ${doc.id} "${doc.title.slice(0, 80)}"${doc.documentDate ? ` dated ${doc.documentDate}` : ""} (${doc.stage})`,
    `excerpt "${excerpt}"`,
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 500);
}

export function parseTag(text: string): MemoryFact["mc"] {
  const m = text.match(TAG_RE);
  if (!m) return null;
  const kv: Record<string, string> = {};
  for (const part of m[1].split(/\s+/)) {
    const i = part.indexOf("=");
    if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1);
  }
  return { claimId: kv.claim, predicate: kv.pred, value: kv.val, stage: kv.stage, contract: kv.contract, effective: kv.eff };
}

export function toMemoryFact(f: RawFact): MemoryFact {
  return {
    factId: String(f.fact_id ?? f.id),
    text: f.fact,
    entitySlug: f.entity_slug ?? null,
    kind: f.kind ?? "fact",
    validFrom: f.valid_from ?? null,
    validUntil: f.valid_until ?? null,
    expiredAt: f.expired_at ?? null,
    supersededBy: f.superseded_by != null ? String(f.superseded_by) : null,
    provenance: f.provenance ?? f.source ?? null,
    confidence: f.confidence ?? null,
    createdAt: f.created_at ?? null,
    mc: parseTag(f.fact),
  };
}

/** Human-readable fact text without the machine tag. */
export function displayFactText(text: string): string {
  return text.replace(TAG_RE, "").trim();
}

/**
 * Rebuilds a comparable claim from a GBrain fact. Prefers the stored claim (richer evidence) but works from the
 * GBrain tag alone, so comparisons survive a wiped local store.
 */
export function claimFromFact(f: MemoryFact, stored?: Claim): Claim | undefined {
  if (stored) return { ...stored, gbrainFactId: f.factId };
  const mc = f.mc;
  if (!mc?.predicate || !mc.value) return undefined;
  const value = valueFromToken(mc.value);
  if (!value) return undefined;
  const def = PREDICATES[mc.predicate];
  const name = displayFactText(f.text).split(" — ")[0] ?? f.entitySlug ?? "unknown";
  return {
    id: mc.claimId ?? `gbrain-${f.factId}`,
    documentId: "gbrain",
    subject: { slug: f.entitySlug ?? "unknown", name },
    predicate: mc.predicate,
    predicateLabel: def?.label ?? mc.predicate,
    value,
    rawValue: value.display,
    qualifiers: { contractId: mc.contract, stage: (mc.stage as Claim["qualifiers"]["stage"]) ?? "unknown" },
    excerpt: displayFactText(f.text),
    excerptStart: 0,
    excerptEnd: 0,
    observedAt: f.createdAt ?? f.validFrom ?? new Date(0).toISOString(),
    effectiveFrom: mc.effective,
    confidence: f.confidence ?? 0.5,
    extractor: "gbrain-fact",
    hedged: false,
    status: "committed",
    gbrainFactId: f.factId,
  };
}
