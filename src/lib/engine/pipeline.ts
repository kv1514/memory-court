// Ingestion pipeline: scan → extract (researcher) → retrieve from GBrain → normalize → compare (researcher)
// → skeptic → decide → commit. Only this module (auto-commit policy) and review.ts (human decisions) write memory.
import { z } from "zod";
import type { Claim, Finding, GbrainWrite, IngestResult, MemoryFact, ReviewAction, ReviewItem, SourceDocument, TraceStep } from "../types";
import * as gb from "../gbrain/client";
import { audit, db, newId, save, sha256 } from "../store";
import { scanForInjection } from "../security";
import { detectStage, extractClaimsRules, RULES_EXTRACTOR } from "../extract/rules";
import { findEntities, registryEntity, similarEntities } from "../entities";
import { parseDate } from "../normalize";
import { claimFromFact, claimProvenance, claimToFactText, toMemoryFact } from "./facts";
import { compareClaims, researcherFinding, skepticChecks, ALERT_TYPES } from "./court";
import { extractClaimsLLM, llmAvailable } from "../extract/llm";

export const IngestInput = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(20_000),
  documentDate: z.string().trim().optional().transform((v) => (v ? parseDate(v) ?? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined) : undefined)),
  author: z.string().trim().max(120).optional(),
});
export type IngestInputT = z.input<typeof IngestInput>;

export interface IngestOptions {
  /** Suffix appended to every entity slug (isolates eval cases inside one brain). */
  ns?: string;
  /** Force the deterministic extractor even when an LLM is configured (evals use this for repeatability). */
  extractor?: "rules" | "llm" | "auto";
}

const ALLOWED: Record<string, ReviewAction[]> = {
  contradiction: ["approve_correction", "reject", "retain_both"],
  legitimate_update: ["retain_both", "approve_correction", "reject"],
  stale_incoming: ["reject", "retain_both"],
  unsupported: ["reject", "approve_correction"],
  prompt_injection: ["reject", "approve_correction"],
};

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;

const today = () => new Date().toISOString().slice(0, 10);

type G = typeof globalThis & { __mcPages?: Set<string> };
const pages = ((globalThis as G).__mcPages ??= new Set<string>());

export function resetPageCache() {
  pages.clear();
}

/** Ensures a GBrain entity page exists so timeline entries and links have an anchor. */
async function ensureEntityPage(slug: string, name: string, writes: GbrainWrite[]) {
  if (pages.has(slug)) return;
  const existing = await gb.getPage(slug);
  if (!existing.found) {
    const content = `---\ntype: company\ntitle: ${JSON.stringify(name)}\ntags: [memory-court]\n---\n# ${name}\n\nFacts about ${name} are verified by Memory Court before they enter memory. Revision history is kept in this page's timeline.\n`;
    const w: GbrainWrite = { op: "put_page", args: { slug }, ok: true, at: new Date().toISOString() };
    try {
      w.result = await gb.putPage(slug, content);
    } catch (e) {
      w.ok = false;
      w.error = (e as Error).message;
    }
    writes.push(w);
  }
  pages.add(slug);
}

async function timeline(slug: string, summary: string, detail: string, source: string, writes: GbrainWrite[]) {
  const w: GbrainWrite = { op: "add_timeline_entry", args: { slug, date: today(), summary }, ok: true, at: new Date().toISOString() };
  try {
    w.result = await gb.addTimelineEntry(slug, today(), summary.slice(0, 240), detail.slice(0, 1500), source);
  } catch (e) {
    w.ok = false;
    w.error = (e as Error).message;
  }
  writes.push(w);
}

/** Writes one claim to GBrain via `remember` (+ entity page + timeline entry). */
export async function commitClaim(c: Claim, doc: SourceDocument, note: string, writes: GbrainWrite[]): Promise<string> {
  await ensureEntityPage(c.subject.slug, c.subject.name, writes);
  const args = { fact: claimToFactText(c), provenance: claimProvenance(c, doc, note), entity: c.subject.slug, kind: "fact" as const };
  const w: GbrainWrite = { op: "remember", args, ok: true, at: new Date().toISOString() };
  try {
    const r = await gb.remember(args);
    w.result = { id: r.id, status: r.status, entity_slug: r.entity_slug };
    c.gbrainFactId = r.id;
    db().factIndex[r.id] = c.id;
    writes.push(w);
    audit("gbrain", "gbrain.remember", `remember → fact #${r.id} (${r.status}): ${c.subject.name} ${c.predicateLabel} ${c.value.display}`, { claimId: c.id, factId: r.id, documentId: doc.id }, w.result);
  } catch (e) {
    w.ok = false;
    w.error = (e as Error).message;
    writes.push(w);
    audit("gbrain", "gbrain.error", `remember failed: ${w.error}`, { claimId: c.id });
    throw e;
  }
  await timeline(c.subject.slug, `Memory Court committed ${c.predicateLabel}: ${c.value.display} (fact #${c.gbrainFactId})`, `${note}. Source: ${doc.title} (${doc.id}). Evidence: "${c.excerpt}"`, `memory-court:${doc.id}`, writes);
  return c.gbrainFactId!;
}

export async function retrieveMemories(slug: string, includeExpired = false): Promise<MemoryFact[]> {
  const r = await gb.recall({ entity: slug, include_expired: includeExpired, limit: 100 });
  // GBrain canonicalizes entity names fuzzily (slug-suffix / title match). Memory Court compares only facts whose
  // stored entity slug is EXACTLY the claim's subject, so "Acme Robotics UK Ltd" never inherits "Acme Robotics Inc".
  return r.facts.map(toMemoryFact).filter((f) => f.entitySlug === slug);
}

function withNs(c: Claim, ns?: string): Claim {
  if (!ns) return c;
  return { ...c, subject: { ...c.subject, slug: `${c.subject.slug}-${ns}` } };
}

export async function ingest(input: IngestInputT, opts: IngestOptions = {}): Promise<IngestResult> {
  const parsed = IngestInput.parse(input);
  const store = db();
  const runId = newId("RUN");
  const trace: TraceStep[] = [];
  const step = (s: Omit<TraceStep, "ms">, t0: number) => trace.push({ ...s, ms: Date.now() - t0 });

  // 1. SCAN — document is untrusted data.
  let t = Date.now();
  const doc: SourceDocument = {
    id: newId("D"),
    title: parsed.title,
    stage: detectStage(parsed.title, parsed.text),
    author: parsed.author || undefined,
    documentDate: parsed.documentDate,
    receivedAt: new Date().toISOString(),
    text: parsed.text,
    sha256: sha256(parsed.text),
    injection: scanForInjection(`${parsed.title}\n${parsed.text}`),
    trust: "untrusted",
  };
  // offsets in the scan are relative to title+newline; shift to body offsets
  const shift = parsed.title.length + 1;
  doc.injection.matches = doc.injection.matches.map((m) => ({ ...m, start: Math.max(0, m.start - shift), end: Math.max(0, m.end - shift) }));
  store.documents[doc.id] = doc;
  audit("system", "document.received", `Received "${doc.title}" (${doc.stage}, sha256 ${doc.sha256.slice(0, 12)}…)`, { documentId: doc.id, runId });
  if (doc.injection.flagged) {
    audit("security", "security.injection_flagged", `Instruction-like content in "${doc.title}": ${doc.injection.matches.map((m) => m.pattern).join(", ")} — document quarantined`, { documentId: doc.id, runId }, doc.injection.matches);
  }
  step({ step: "scan", role: "system", label: "Security scan", detail: doc.injection.flagged ? `QUARANTINED — ${doc.injection.matches.length} instruction-like span(s): ${[...new Set(doc.injection.matches.map((m) => m.pattern))].join(", ")}` : `stage=${doc.stage}; no instruction-like content`, status: doc.injection.flagged ? "warn" : "ok", data: doc.injection }, t);

  // 2. EXTRACT — researcher produces atomic claims with verbatim evidence.
  t = Date.now();
  const useLLM = opts.extractor === "llm" || (opts.extractor !== "rules" && llmAvailable());
  let claims: Claim[];
  let extractorNote = RULES_EXTRACTOR;
  if (useLLM) {
    try {
      claims = await extractClaimsLLM(doc);
      extractorNote = claims[0]?.extractor ?? "llm";
    } catch (e) {
      claims = extractClaimsRules(doc);
      extractorNote = `${RULES_EXTRACTOR} (LLM failed: ${(e as Error).message.slice(0, 80)})`;
    }
  } else claims = extractClaimsRules(doc);
  claims = claims.map((c) => withNs(c, opts.ns));
  for (const c of claims) store.claims[c.id] = c;
  audit("researcher", "claims.extracted", `${claims.length} claim(s) extracted by ${extractorNote}`, { documentId: doc.id, runId }, claims.map((c) => ({ id: c.id, subject: c.subject.slug, predicate: c.predicate, value: c.value.display })));
  step({ step: "extract", role: "researcher", label: "Extract atomic claims", detail: `${claims.length} claim(s) via ${extractorNote}${doc.injection.flagged ? "; instruction-like sentences skipped" : ""}`, status: claims.length ? "ok" : "warn", data: claims.map((c) => ({ id: c.id, subject: c.subject.name, predicate: c.predicateLabel, value: c.value.display })) }, t);

  // 3. RETRIEVE — existing knowledge comes from GBrain, not local state.
  t = Date.now();
  const subjects = [...new Set(claims.map((c) => c.subject.slug))];
  const memoryBySubject = new Map<string, MemoryFact[]>();
  for (const s of subjects) memoryBySubject.set(s, await retrieveMemories(s));
  const retrieved = [...memoryBySubject.values()].flat();
  step({ step: "retrieve", role: "researcher", label: "Retrieve related memories from GBrain", detail: `recall(entity) × ${subjects.length} → ${retrieved.length} active fact(s)`, status: "ok", data: retrieved.map((f) => ({ factId: f.factId, entity: f.entitySlug, text: f.text })) }, t);

  // 4. NORMALIZE — values were normalized at extraction; report conversions.
  t = Date.now();
  const conversions = claims.filter((c) => c.value.display.includes("from") || /lb|pound|month/i.test(c.rawValue));
  step({ step: "normalize", role: "researcher", label: "Normalize entities, units & dates", detail: `${claims.length} value(s) canonicalized${conversions.length ? `; ${conversions.map((c) => `"${c.rawValue}" → ${c.value.display}`).join("; ")}` : ""}`, status: "ok" }, t);

  // 5. COMPARE — deterministic contradiction engine.
  t = Date.now();
  const docs = (id: string) => store.documents[id];
  const findings: Finding[] = [];
  for (const c of claims) {
    const memories = (memoryBySubject.get(c.subject.slug) ?? [])
      .map((f) => ({ f, claim: claimFromFact(f, f.mc?.claimId ? store.claims[f.mc.claimId] : store.claims[store.factIndex[f.factId]]) }))
      .filter((x) => x.claim && x.claim.predicate === c.predicate && x.claim.id !== c.id);
    if (memories.length === 0) {
      findings.push({
        id: newId("F"),
        runId,
        type: "new_fact",
        severity: "info",
        raisedBy: "researcher",
        title: `New knowledge: ${c.subject.name} ${c.predicateLabel} ${c.value.display}`,
        claimId: c.id,
        rationale: ["No existing GBrain memory for this entity + attribute."],
        evidence: [{ side: "incoming", claimId: c.id, documentId: doc.id, documentTitle: doc.title, stage: c.qualifiers.stage, date: c.effectiveFrom, excerpt: c.excerpt, valueDisplay: c.value.display }],
        checks: [],
        uncertainty: 0.1,
        recommendedAction: "commit",
      });
    }
    for (const { f, claim: m } of memories) {
      const cmp = compareClaims(c, m!, docs);
      findings.push(researcherFinding(runId, c, m!, cmp, docs, f.provenance ?? undefined));
    }
  }
  const byType = (ty: string) => findings.filter((f) => f.type === ty).length;
  step({ step: "compare", role: "researcher", label: "Compare with memory", detail: `${byType("contradiction")} contradiction · ${byType("legitimate_update")} legitimate update · ${byType("stale_incoming")} stale · ${byType("corroboration")} corroboration · ${byType("new_fact")} new`, status: byType("contradiction") ? "warn" : "ok" }, t);

  // 6. SKEPTIC — independent evidence checks + integrity findings.
  t = Date.now();
  const skeptic = new Map<string, ReturnType<typeof skepticChecks>>();
  for (const c of claims) {
    const rep = skepticChecks(c, doc);
    skeptic.set(c.id, rep);
    for (const f of findings.filter((x) => x.claimId === c.id)) {
      f.checks = [...f.checks, ...rep.checks];
      if (rep.unsupported || rep.quarantined) f.uncertainty = Math.min(0.95, f.uncertainty + 0.3);
      if (f.evidence[1] && f.evidence[1].documentId === "gbrain") {
        f.checks.push({ name: "memory_evidence_on_record", passed: false, detail: "memory fact has no local evidence record; relying on GBrain provenance only", deterministic: true });
        f.uncertainty = Math.min(0.95, f.uncertainty + 0.1);
      }
    }
    if (rep.quarantined) {
      findings.push({
        id: newId("F"),
        runId,
        type: "prompt_injection",
        severity: "critical",
        raisedBy: "skeptic",
        title: `Quarantined: "${doc.title}" contains instructions aimed at the agent`,
        claimId: c.id,
        rationale: [
          "The document contains instruction-like text (e.g. overriding instructions or bulk-changing memory). Documents are data and carry no authority.",
          "Instruction sentences were not extracted; remaining claims from this document are quarantined and cannot enter memory without an explicit human override.",
        ],
        evidence: doc.injection.matches.slice(0, 4).map((m) => ({ side: "incoming" as const, documentId: doc.id, documentTitle: doc.title, excerpt: m.excerpt })),
        checks: rep.checks,
        uncertainty: 0.05,
        recommendedAction: "reject",
      });
    } else if (rep.unsupported) {
      findings.push({
        id: newId("F"),
        runId,
        type: "unsupported",
        severity: "medium",
        raisedBy: "skeptic",
        title: `Unsupported assertion: ${c.subject.name} ${c.predicateLabel} ${c.value.display}`,
        claimId: c.id,
        rationale: rep.reasons,
        evidence: [{ side: "incoming", claimId: c.id, documentId: doc.id, documentTitle: doc.title, stage: doc.stage, excerpt: c.excerpt, valueDisplay: c.value.display }],
        checks: rep.checks,
        uncertainty: 0.3,
        recommendedAction: "reject",
      });
    }
    const base = c.subject.slug.replace(opts.ns ? new RegExp(`-${opts.ns}$`) : /$^/, "");
    const reg = registryEntity(base);
    const similar = similarEntities(base, reg?.name ?? c.subject.name).filter((e) => e.slug !== base);
    for (const e of similar) {
      const otherSlug = opts.ns ? `${e.slug}-${opts.ns}` : e.slug;
      const other = await retrieveMemories(otherSlug);
      const samePred = other.filter((f) => f.mc?.predicate === c.predicate);
      if (samePred.length) {
        findings.push({
          id: newId("F"),
          runId,
          type: "distinct_entity",
          severity: "info",
          raisedBy: "skeptic",
          title: `Not compared with ${e.name}: different legal entity`,
          claimId: c.id,
          rationale: [`"${c.subject.matchedAlias ?? c.subject.name}" resolves to ${c.subject.slug}; ${e.name} (${otherSlug}) is a separate entity with its own ${c.predicateLabel} (${samePred.map((f) => `fact #${f.factId}`).join(", ")}).`],
          evidence: [
            { side: "incoming", claimId: c.id, documentId: doc.id, documentTitle: doc.title, excerpt: c.excerpt, valueDisplay: c.value.display },
            ...samePred.slice(0, 1).map((f) => ({ side: "memory" as const, gbrainFactId: f.factId, excerpt: f.text.replace(/\[mc [^\]]+\]/, "").trim(), provenance: f.provenance ?? undefined })),
          ],
          checks: [{ name: "entity_disambiguation", passed: true, detail: `longest-alias match "${c.subject.matchedAlias}" → ${c.subject.slug}`, deterministic: true }],
          uncertainty: 0.1,
          recommendedAction: "none",
        });
      }
    }
  }
  for (const f of findings) f.uncertainty = Math.round(f.uncertainty * 100) / 100;
  const sk = findings.filter((f) => f.raisedBy === "skeptic");
  step({ step: "skeptic", role: "skeptic", label: "Skeptic challenges evidence", detail: `${claims.length * 5} deterministic checks; ${sk.filter((f) => f.type === "unsupported").length} unsupported · ${sk.filter((f) => f.type === "prompt_injection").length} injection · ${sk.filter((f) => f.type === "distinct_entity").length} entity disambiguation`, status: sk.some((f) => f.type !== "distinct_entity") ? "warn" : "ok" }, t);

  // 7. DECIDE + 8. COMMIT
  t = Date.now();
  const reviewItems: ReviewItem[] = [];
  const toCommit: Claim[] = [];
  for (const c of claims) {
    const fs = findings.filter((f) => f.claimId === c.id);
    const rep = skeptic.get(c.id)!;
    const gate = fs.find((f) => f.type === "prompt_injection") ?? fs.find((f) => f.type === "unsupported");
    const disputes = fs.filter((f) => ["contradiction", "legitimate_update", "stale_incoming"].includes(f.type)).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const lead = gate ?? disputes[0];
    if (lead) {
      c.status = rep.quarantined ? "quarantined" : rep.unsupported ? "unsupported" : "pending_review";
      const memoryFinding = disputes[0];
      const item: ReviewItem = {
        id: newId("R"),
        runId,
        createdAt: new Date().toISOString(),
        status: "pending",
        classification: lead.type,
        severity: lead.severity,
        title: lead.title,
        claimId: c.id,
        findingIds: fs.map((f) => f.id),
        memoryClaimId: memoryFinding?.memoryClaimId,
        gbrainFactId: memoryFinding?.gbrainFactId,
        recommended: lead.recommendedAction,
        allowedActions: ALLOWED[lead.type] ?? ["reject"],
      };
      reviewItems.push(item);
      store.reviews[item.id] = item;
      audit(lead.raisedBy, "review.queued", `${item.id} ${lead.type}: ${lead.title}`, { reviewId: item.id, claimId: c.id, factId: item.gbrainFactId, runId });
    } else if (fs.some((f) => f.type === "corroboration")) {
      c.status = "corroborated";
      const cf = fs.find((f) => f.type === "corroboration")!;
      c.gbrainFactId = cf.gbrainFactId;
      audit("researcher", "claim.corroborated", `${c.id} corroborates GBrain fact #${cf.gbrainFactId}`, { claimId: c.id, factId: cf.gbrainFactId, runId });
    } else {
      c.status = "supported";
      toCommit.push(c);
    }
  }
  for (const f of findings) {
    store.findings[f.id] = f;
    if (f.type !== "new_fact" && f.type !== "corroboration") audit(f.raisedBy, "finding.raised", `${f.type} (${f.severity}): ${f.title}`, { findingId: f.id, claimId: f.claimId, runId });
  }
  step({ step: "decide", role: "system", label: "Decide", detail: `${toCommit.length} auto-commit · ${reviewItems.length} to human review · ${claims.filter((c) => c.status === "corroborated").length} corroborated`, status: reviewItems.length ? "warn" : "ok" }, t);

  t = Date.now();
  const committed: GbrainWrite[] = [];
  for (const c of toCommit) {
    try {
      await commitClaim(c, doc, "auto-committed: new, supported, no conflict", committed);
      c.status = "committed";
    } catch {
      c.status = "supported";
    }
  }
  step({ step: "commit", role: "system", label: "Commit to GBrain", detail: toCommit.length ? `${committed.filter((w) => w.op === "remember" && w.ok).length} fact(s) written via remember; disputed claims held for review` : "nothing auto-committed; disputed or unsupported claims held for review", status: committed.some((w) => !w.ok) ? "error" : "ok", data: committed }, t);

  store.runs[runId] = { id: runId, documentId: doc.id, at: doc.receivedAt, claimIds: claims.map((c) => c.id), findingIds: findings.map((f) => f.id), reviewIds: reviewItems.map((r) => r.id), trace };
  save();
  return { runId, document: doc, claims, findings, reviewItems, committed, trace };
}

export function isAlert(f: Finding) {
  return ALERT_TYPES.includes(f.type);
}

export function entitiesInText(text: string) {
  return findEntities(text);
}
