// The contradiction engine. RESEARCHER compares an incoming claim with retrieved memories using
// deterministic rules (entity, predicate, contract identity, negotiation stage, validity time, units).
// SKEPTIC independently re-checks evidence and raises integrity findings. No LLM decides truth here.
import type { Check, Claim, DocStage, Evidence, Finding, FindingType, RecommendedAction, Severity, SourceDocument } from "../types";
import { valuesEqual } from "../normalize";
import { PREDICATES, CHANGE_RE } from "../extract/rules";
import { newId } from "../store";

const BINDING: DocStage[] = ["signed", "amendment", "policy"];
const NON_BINDING: DocStage[] = ["quote", "proposal", "draft"];

export const AUTHORITY: Record<DocStage, number> = {
  signed: 0.9,
  amendment: 0.9,
  policy: 0.85,
  record: 0.6,
  quote: 0.55,
  proposal: 0.5,
  unknown: 0.4,
  message: 0.35,
  draft: 0.3,
};

export const ALERT_TYPES: FindingType[] = ["contradiction", "stale_incoming", "unsupported", "prompt_injection"];

export interface DocLookup {
  (id: string): SourceDocument | undefined;
}

function evidenceOf(side: Evidence["side"], c: Claim, doc?: SourceDocument, provenance?: string): Evidence {
  return {
    side,
    claimId: c.id,
    gbrainFactId: c.gbrainFactId,
    documentId: doc?.id ?? c.documentId,
    documentTitle: doc?.title ?? (c.documentId === "gbrain" ? "GBrain memory (no local evidence record)" : undefined),
    stage: c.qualifiers.stage,
    date: c.effectiveFrom ?? c.documentDate,
    excerpt: c.excerpt,
    valueDisplay: c.value.display,
    provenance,
  };
}

const authority = (c: Claim) => AUTHORITY[c.qualifiers.stage ?? "unknown"] * (c.hedged ? 0.5 : 1);

function sameContract(n: Claim, m: Claim, nDoc?: SourceDocument, mDoc?: SourceDocument): { same: boolean | undefined; detail: string } {
  const a = n.qualifiers.contractId;
  const b = m.qualifiers.contractId;
  if (!a || !b) return { same: undefined, detail: "contract identity not stated on both sides" };
  if (a === b) return { same: true, detail: `both reference contract ${a}` };
  const nRefs = nDoc ? `${nDoc.title}\n${nDoc.text}` : "";
  const mRefs = mDoc ? `${mDoc.title}\n${mDoc.text}` : "";
  if (new RegExp(`\\b${b}\\b`).test(nRefs)) return { same: true, detail: `${a} explicitly references ${b} (same deal lineage)` };
  if (new RegExp(`\\b${a}\\b`).test(mRefs)) return { same: true, detail: `${b} references ${a} (same deal lineage)` };
  return { same: false, detail: `different contracts (${a} vs ${b})` };
}

export interface Comparison {
  type: FindingType;
  severity: Severity;
  title: string;
  rationale: string[];
  checks: Check[];
  uncertainty: number;
  recommended: RecommendedAction;
}

/** RESEARCHER: classify one incoming claim against one retrieved memory (same subject + predicate). */
export function compareClaims(n: Claim, m: Claim, docs: DocLookup): Comparison {
  const def = PREDICATES[n.predicate];
  const nDoc = docs(n.documentId);
  const mDoc = docs(m.documentId);
  const checks: Check[] = [
    { name: "same_entity", passed: n.subject.slug === m.subject.slug, detail: `${n.subject.slug} ↔ ${m.subject.slug}`, deterministic: true },
    { name: "same_attribute", passed: n.predicate === m.predicate, detail: n.predicateLabel, deterministic: true },
  ];
  const rationale: string[] = [];
  let uncertainty = 0.1;
  const eq = valuesEqual(n.value, m.value);
  checks.push({ name: "normalized_values_equal", passed: eq, detail: `${n.value.display} vs ${m.value.display}`, deterministic: true });
  if (eq) {
    const unitsDiffer = n.rawValue.replace(/[\d.,\s$]/g, "").toLowerCase() !== m.rawValue.replace(/[\d.,\s$]/g, "").toLowerCase();
    if (unitsDiffer) rationale.push(`Different surface units ("${n.rawValue}" vs "${m.rawValue}") normalize to the same value.`);
    rationale.push("Incoming claim corroborates existing memory; no write needed, evidence linked.");
    return { type: "corroboration", severity: "info", title: `Corroborates memory: ${n.predicateLabel} ${n.value.display}`, rationale, checks, uncertainty: 0.05, recommended: "none" };
  }

  if (def?.contractScoped) {
    const sc = sameContract(n, m, nDoc, mDoc);
    checks.push({ name: "same_contract", passed: sc.same !== false, detail: sc.detail, deterministic: true });
    if (sc.same === false) {
      rationale.push(`Values differ but belong to ${sc.detail}; not a contradiction.`);
      return { type: "distinct_scope", severity: "info", title: `Different contract: ${n.qualifiers.contractId}`, rationale, checks, uncertainty: 0.15, recommended: "commit" };
    }
    if (sc.same === undefined) uncertainty += 0.15;
    const ns = n.qualifiers.stage ?? "unknown";
    const ms = m.qualifiers.stage ?? "unknown";
    checks.push({ name: "negotiation_stage", passed: true, detail: `memory: ${ms} → incoming: ${ns}`, deterministic: true });
    if (NON_BINDING.includes(ms) && BINDING.includes(ns)) {
      rationale.push(`Memory holds a non-binding ${ms}${m.qualifiers.contractId ? ` (${m.qualifiers.contractId})` : ""}; the incoming document is a ${ns} agreement${n.qualifiers.contractId ? ` (${n.qualifiers.contractId})` : ""}. This is negotiation history, not a contradiction.`);
      rationale.push(`Proposed current ${n.predicateLabel}: ${n.value.display} (${ns}). Keep the ${ms} (${m.value.display}) in memory as history — it was never wrong, only superseded.`);
      return { type: "legitimate_update", severity: "low", title: `Negotiation progressed: ${ms} ${m.value.display} → ${ns} ${n.value.display} · propose ${n.value.display} as current`, rationale, checks, uncertainty: Math.min(0.9, uncertainty + 0.05), recommended: "retain_both" };
    }
    if (BINDING.includes(ms) && NON_BINDING.includes(ns)) {
      rationale.push(`Incoming value comes from a non-binding ${ns}; it cannot change the ${ms} terms already in memory.`);
      return { type: "distinct_scope", severity: "info", title: `Non-binding ${ns} does not alter ${ms} terms`, rationale, checks, uncertainty: uncertainty + 0.1, recommended: "commit" };
    }
    if (ns === "amendment" && ms !== "amendment") {
      rationale.push("Incoming document is a signed amendment to the same agreement; it revises the value going forward.");
      return { type: "legitimate_update", severity: "low", title: `Contract amended: ${m.value.display} → ${n.value.display}`, rationale, checks, uncertainty, recommended: "retain_both" };
    }
  }

  const effN = n.effectiveFrom ?? n.documentDate;
  const effM = m.effectiveFrom ?? m.documentDate;
  checks.push({ name: "validity_order", passed: true, detail: `memory effective ${effM ?? "unknown"}; incoming effective ${effN ?? "unknown"}`, deterministic: true });
  if (effN && effM && effN < effM) {
    rationale.push(`Incoming claim is effective ${effN}, earlier than the memory's ${effM}: it is outdated information, not a correction.`);
    return { type: "stale_incoming", severity: "medium", title: `Outdated: ${n.value.display} (${effN}) predates memory ${m.value.display} (${effM})`, rationale, checks, uncertainty: uncertainty + 0.1, recommended: "reject" };
  }
  if (effN && effM && effN > effM) {
    const changeLanguage = CHANGE_RE.test(n.excerpt) || ["policy", "amendment"].includes(n.qualifiers.stage ?? "");
    checks.push({ name: "explicit_change_signal", passed: changeLanguage, detail: changeLanguage ? "incoming document states a change / is a policy or amendment" : "no change language", deterministic: true });
    if (def?.timeVarying || changeLanguage) {
      rationale.push(
        def?.timeVarying
          ? `"${n.predicateLabel}" legitimately changes over time; the incoming value is effective later (${effN} > ${effM}).`
          : `Incoming document explicitly changes the value, effective ${effN}.`,
      );
      return { type: "legitimate_update", severity: "low", title: `Changed over time: ${m.value.display} → ${n.value.display} (effective ${effN})`, rationale, checks, uncertainty, recommended: "retain_both" };
    }
    rationale.push(`A fixed contract term differs in a later document (${effN}) that does not state an amendment.`);
  } else {
    rationale.push(effN && effM ? `Both claims apply from the same date (${effN}).` : "Validity dates overlap or are unknown.");
  }

  // Genuine conflict: same entity, attribute, scope and period with incompatible values.
  const aN = authority(n);
  const aM = authority(m);
  checks.push({ name: "source_authority", passed: true, detail: `incoming ${n.qualifiers.stage ?? "unknown"} (${aN.toFixed(2)}) vs memory ${m.qualifiers.stage ?? "unknown"} (${aM.toFixed(2)})`, deterministic: true });
  let recommended: RecommendedAction = "hold";
  if (aN - aM >= 0.1) {
    recommended = "approve_correction";
    rationale.push(`Incoming evidence is more authoritative (${n.qualifiers.stage} vs ${m.qualifiers.stage}); recommend correcting memory after human review.`);
  } else if (aM - aN >= 0.1) {
    recommended = "reject";
    rationale.push(`Existing memory is backed by more authoritative evidence (${m.qualifiers.stage} vs ${n.qualifiers.stage}); recommend rejecting the incoming claim.`);
  } else {
    uncertainty += 0.25;
    rationale.push("Sources have comparable authority; a human must decide.");
  }
  const rel = n.value.amount && m.value.amount ? Math.abs(n.value.amount - m.value.amount) / Math.max(n.value.amount, m.value.amount) : 1;
  const severity: Severity = n.value.kind === "money" || rel > 0.1 ? "high" : "medium";
  return {
    type: "contradiction",
    severity,
    title: `Contradiction: ${n.subject.name} ${n.predicateLabel} ${m.value.display} (memory) vs ${n.value.display} (incoming)`,
    rationale,
    checks,
    uncertainty: Math.min(0.95, uncertainty + 0.1),
    recommended,
  };
}

export function researcherFinding(runId: string, n: Claim, m: Claim, cmp: Comparison, docs: DocLookup, memoryProvenance?: string): Finding {
  return {
    id: newId("F"),
    runId,
    type: cmp.type,
    severity: cmp.severity,
    raisedBy: "researcher",
    title: cmp.title,
    claimId: n.id,
    memoryClaimId: m.id,
    gbrainFactId: m.gbrainFactId,
    rationale: cmp.rationale,
    evidence: [evidenceOf("incoming", n, docs(n.documentId)), evidenceOf("memory", m, docs(m.documentId), memoryProvenance)],
    checks: cmp.checks,
    uncertainty: Math.round(cmp.uncertainty * 100) / 100,
    recommendedAction: cmp.recommended,
  };
}

export interface SkepticReport {
  checks: Check[];
  unsupported: boolean;
  quarantined: boolean;
  reasons: string[];
}

/** SKEPTIC: independent, deterministic evidence checks on an incoming claim. */
export function skepticChecks(c: Claim, doc: SourceDocument): SkepticReport {
  const checks: Check[] = [];
  const reasons: string[] = [];
  const grounded = doc.text.slice(c.excerptStart, c.excerptEnd) === c.excerpt && doc.text.includes(c.excerpt);
  checks.push({ name: "excerpt_grounded", passed: grounded, detail: grounded ? "excerpt is a verbatim span of the source" : "excerpt not found verbatim in source", deterministic: true });
  const digits = (s: string) => s.replace(/[^\d]/g, "");
  const valueInExcerpt = c.excerpt.includes(c.rawValue) || (digits(c.rawValue).length > 0 && digits(c.excerpt).includes(digits(c.rawValue)));
  checks.push({ name: "value_in_excerpt", passed: valueInExcerpt, detail: valueInExcerpt ? `"${c.rawValue}" appears in the evidence` : `"${c.rawValue}" absent from the evidence`, deterministic: true });
  checks.push({ name: "assertive_language", passed: !c.hedged, detail: c.hedged ? "hedged / rumor language in the evidence" : "stated as fact", deterministic: true });
  const attributed = Boolean(doc.author) || ["signed", "amendment", "policy", "record", "quote", "proposal"].includes(doc.stage);
  checks.push({ name: "source_attribution", passed: attributed, detail: attributed ? `${doc.stage} document${doc.author ? ` by ${doc.author}` : ""}` : "unattributed informal message", deterministic: true });
  checks.push({ name: "injection_screen", passed: !doc.injection.flagged, detail: doc.injection.flagged ? `${doc.injection.matches.length} instruction-like span(s) in source` : "no instruction-like content", deterministic: true });
  if (!grounded) reasons.push("Evidence excerpt could not be located in the source document.");
  if (!valueInExcerpt) reasons.push("The asserted value does not appear in the cited evidence.");
  if (c.hedged) reasons.push("The source hedges the statement (rumor / speculation).");
  if (!attributed && c.hedged) reasons.push("No accountable source.");
  const unsupported = !grounded || !valueInExcerpt || c.hedged;
  return { checks, unsupported, quarantined: doc.injection.flagged, reasons };
}
