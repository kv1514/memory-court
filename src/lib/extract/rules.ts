// Deterministic claim extractor (RESEARCHER, no LLM). Every claim carries a verbatim excerpt with offsets.
import { randomUUID } from "node:crypto";
import type { Claim, DocStage, NormalizedValue, SourceDocument } from "../types";
import { findEntities, type EntityMention } from "../entities";
import { findDates, findDurations, findMoney, findPercents, findQuantities, toAnnual, type ValueHit } from "../normalize";
import { overlapsInjection } from "../security";

export const RULES_EXTRACTOR = "rules@1";

export interface PredicateDef {
  id: string;
  label: string;
  /** Contract-scoped predicates carry contract id + negotiation stage; values are fixed unless amended. */
  contractScoped: boolean;
  /** Values that legitimately drift over time (headcount, policies, prices). */
  timeVarying: boolean;
}

export const PREDICATES: Record<string, PredicateDef> = {
  "contract.annual_value": { id: "contract.annual_value", label: "annual contract value", contractScoped: true, timeVarying: false },
  "contract.total_value": { id: "contract.total_value", label: "contract value", contractScoped: true, timeVarying: false },
  "contract.payment_terms": { id: "contract.payment_terms", label: "payment terms", contractScoped: true, timeVarying: false },
  "contract.sla_uptime": { id: "contract.sla_uptime", label: "SLA uptime", contractScoped: true, timeVarying: false },
  "policy.refund_window": { id: "policy.refund_window", label: "refund window", contractScoped: false, timeVarying: true },
  "org.headcount": { id: "org.headcount", label: "headcount", contractScoped: false, timeVarying: true },
  "product.payload_capacity": { id: "product.payload_capacity", label: "payload capacity", contractScoped: false, timeVarying: false },
  "pricing.per_seat": { id: "pricing.per_seat", label: "price per seat", contractScoped: false, timeVarying: true },
};

interface Rule {
  predicate: string;
  trigger: RegExp;
  values: (s: string) => ValueHit[];
  post?: (v: NormalizedValue) => NormalizedValue;
}

const RULES: Rule[] = [
  { predicate: "policy.refund_window", trigger: /\brefunds?\b|\breturn window\b/i, values: (s) => findDurations(s).filter((h) => !/net/i.test(h.raw)) },
  { predicate: "contract.payment_terms", trigger: /\bpayment terms?\b|\bnet[\s-]?\d{1,3}\b/i, values: (s) => findDurations(s) },
  { predicate: "contract.sla_uptime", trigger: /\buptime\b|\bavailability\b|\bSLA\b/i, values: (s) => findPercents(s) },
  { predicate: "org.headcount", trigger: /\bheadcount\b|\bemployees\b|\bstaff\b|\bFTEs?\b/i, values: (s) => findQuantities(s).filter((h) => h.value.unit === "people") },
  { predicate: "product.payload_capacity", trigger: /\bpayload\b|\bload capacity\b|\bcarrying capacity\b|\bmax(?:imum)? load\b/i, values: (s) => findQuantities(s).filter((h) => h.value.unit === "kg") },
  { predicate: "pricing.per_seat", trigger: /\bper (seat|user|licen[cs]e)\b|\bseat price\b/i, values: (s) => findMoney(s) },
  {
    predicate: "contract.value",
    trigger: /\b(fee|fees|price|priced|value|total|amount|cost|quote|quoted|quotation|agreement|contract|subscription|pay|payable|invoice|billed|billing|charged)\b/i,
    values: (s) => findMoney(s),
  },
];

const HEDGE_RE = /\b(I think|I believe|maybe|might|may be|probably|possibly|rumou?r(?:ed)?|I heard|heard that|unconfirmed|allegedly|not sure|apparently|supposedly|it seems|could be)\b/i;
const LINEAGE_RE = /\b(supersedes|replaces|replacing|superseding|previously|formerly|pursuant to|references?)\b/i;
const CHANGE_RE = /\b(chang(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|revis(?:e|es|ed|ing)|lower(?:s|ed)?|rais(?:e|es|ed)|mov(?:e|es|ed)|updat(?:e|es|ed|ing)|amend(?:s|ed)?)\b/i;

export function detectStage(title: string, text: string): DocStage {
  // The title names the document type ("CRM note", "Quote", "Amendment"); it outranks words quoted in the body.
  if (/\bamendment\b/i.test(title)) return "amendment";
  if (/\b(quot(?:e|ation)|estimate)\b/i.test(title)) return "quote";
  if (/\bproposal\b/i.test(title)) return "proposal";
  if (/\bdraft\b/i.test(title)) return "draft";
  if (/\b(crm|account note|notes?|profile|filing|datasheet|data sheet|spec sheet|report|record|minutes)\b/i.test(title)) return "record";
  if (/\b(slack|e-?mail|chat|message|dm|thread|sms)\b/i.test(title)) return "message";
  if (/\b(policy|handbook|terms of service)\b/i.test(title)) return "policy";
  if (/\b(signed|executed|countersigned)\b/i.test(title)) return "signed";
  const head = text.slice(0, 400);
  if (/\bamendment\b/i.test(head)) return "amendment";
  if (/\bdraft\b/i.test(head)) return "draft";
  if (/\b(signed|executed|countersigned)\b/i.test(head)) return "signed";
  if (/\b(policy|handbook)\b/i.test(head)) return "policy";
  if (/\b(quot(?:e|ation))\b/i.test(head)) return "quote";
  return "unknown";
}

export interface Sentence { text: string; start: number; end: number }

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+(?:[.!?](?!\d)(?<!\b(?:Inc|Ltd|Corp|Co|No|vs|approx|e\.g|i\.e)\.)|(?=\n)|$)+/g;
  let buf: Sentence | null = null;
  for (const m of text.matchAll(/[^\n]+/g)) {
    // split each line on sentence boundaries that are followed by whitespace + capital/digit
    const line = m[0];
    const base = m.index!;
    let last = 0;
    for (const b of line.matchAll(/(?<!\b(?:Inc|Ltd|Corp|Co|No|vs|approx|Mr|Ms|Dr))[.!?](?=\s+[A-Z0-9"“(])/g)) {
      const end = b.index! + 1;
      const seg = line.slice(last, end);
      if (seg.trim()) out.push({ text: seg.trim(), start: base + last + (seg.length - seg.trimStart().length), end: base + end });
      last = end;
    }
    const seg = line.slice(last);
    if (seg.trim()) out.push({ text: seg.trim(), start: base + last + (seg.length - seg.trimStart().length), end: base + line.length - (seg.length - seg.trimEnd().length) });
  }
  void re;
  void buf;
  return out;
}

const CONTRACT_ID_RE = /\b(agreements?|contracts?|MSA|SOW|quotes?|quotation|order form|PO|amendment|invoice|proposal)\b[^.\n]{0,30}?\b([A-Z]{1,5}-\d{1,6})\b/gi;

export function contractIds(text: string): { primary?: string; related: string[] } {
  const related: string[] = [];
  let primary: string | undefined;
  for (const m of text.matchAll(CONTRACT_ID_RE)) {
    const pre = text.slice(Math.max(0, m.index! - 40), m.index! + m[0].length);
    const id = m[2].toUpperCase();
    if (LINEAGE_RE.test(pre)) {
      if (!related.includes(id)) related.push(id);
    } else if (!primary) primary = id;
    else if (id !== primary && !related.includes(id)) related.push(id);
  }
  return { primary, related };
}

function effectiveDate(sentence: string, docText: string, documentDate?: string): string | undefined {
  const eff = /\beffective(?:\s+(?:as of|from|on|date:?))?\s+/i;
  const m = sentence.match(eff);
  if (m) {
    const d = findDates(sentence.slice(m.index!))[0];
    if (d) return d.iso;
    if (/\beffective\s+immediately\b/i.test(sentence)) return documentDate;
  }
  const dm = docText.match(eff);
  if (dm) {
    const d = findDates(docText.slice(dm.index!, dm.index! + 60))[0];
    if (d) return d.iso;
  }
  return documentDate;
}

function sentenceStage(s: string, docStage: DocStage): DocStage {
  if (/\bamend(?:ed|ment)\b/i.test(s)) return "amendment";
  if (/\bquot(?:e|ed|ation)\b/i.test(s)) return "quote";
  if (/\bdraft\b/i.test(s)) return "draft";
  if (/\b(signed|executed|countersigned)\b/i.test(s)) return "signed";
  return docStage;
}

/** Picks the value a sentence asserts: for "changes from X to Y" the new value Y, else the first hit. */
function pickValue(s: string, hits: ValueHit[]): ValueHit | undefined {
  if (hits.length === 0) return undefined;
  if (hits.length > 1 && CHANGE_RE.test(s) && /\bfrom\b/i.test(s) && /\bto\b/i.test(s)) {
    const to = hits.find((h) => /\bto\s*$/i.test(s.slice(Math.max(0, h.start - 6), h.start)));
    return to ?? hits[hits.length - 1];
  }
  return hits[0];
}

export function primaryEntity(doc: Pick<SourceDocument, "title" | "text">): EntityMention | undefined {
  const inTitle = findEntities(doc.title)[0];
  if (inTitle) return inTitle;
  const counts = new Map<string, { m: EntityMention; n: number }>();
  for (const m of findEntities(doc.text)) {
    const c = counts.get(m.slug) ?? { m, n: 0 };
    c.n += 1;
    counts.set(m.slug, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.m;
}

export function extractClaimsRules(doc: SourceDocument): Claim[] {
  const claims: Claim[] = [];
  const primary = primaryEntity(doc);
  const ids = contractIds(`${doc.title}\n${doc.text}`);
  for (const sent of splitSentences(doc.text)) {
    if (overlapsInjection(doc.injection, sent.start, sent.end)) continue; // instruction-like text is never a fact
    const mention = findEntities(sent.text)[0];
    const subject = mention ?? primary;
    if (!subject) continue;
    const used = new Set<string>();
    for (const rule of RULES) {
      if (!rule.trigger.test(sent.text)) continue;
      const hit = pickValue(sent.text, rule.values(sent.text));
      if (!hit) continue;
      if (LINEAGE_RE.test(sent.text) && !(CHANGE_RE.test(sent.text) && /\bto\b/i.test(sent.text))) continue;
      let predicate = rule.predicate;
      let value = hit.value;
      if (predicate === "contract.value") {
        const annual = value.period !== "one_time" || /\b(annual(?:ly)?|per year|yearly|per annum)\b/i.test(sent.text);
        predicate = annual ? "contract.annual_value" : "contract.total_value";
        if (annual && value.period === "one_time") value = { ...value, period: "year", display: `${value.display} / year` };
        if (annual) value = toAnnual(value);
      }
      if (used.has(predicate)) continue;
      used.add(predicate);
      const def = PREDICATES[predicate];
      const sentIds = contractIds(sent.text);
      const stage = def.contractScoped ? sentenceStage(sent.text, doc.stage) : doc.stage;
      const excerptStart = sent.start;
      const excerptEnd = sent.end;
      claims.push({
        id: `C-${randomUUID().slice(0, 6)}`,
        documentId: doc.id,
        subject: { slug: subject.slug, name: subject.name, matchedAlias: subject.alias },
        predicate,
        predicateLabel: def.label,
        value,
        rawValue: hit.raw,
        qualifiers: {
          ...(def.contractScoped ? { contractId: sentIds.primary ?? ids.primary, stage } : { stage }),
          ...(ids.related.length ? { scope: `${/\b(supersed|replac)/i.test(doc.text) ? "supersedes" : "references"} ${ids.related.join(", ")}` } : {}),
        },
        excerpt: doc.text.slice(excerptStart, excerptEnd),
        excerptStart,
        excerptEnd,
        observedAt: doc.receivedAt,
        documentDate: doc.documentDate,
        effectiveFrom: effectiveDate(sent.text, doc.text, doc.documentDate),
        confidence: mention ? 0.9 : 0.75,
        extractor: RULES_EXTRACTOR,
        hedged: HEDGE_RE.test(sent.text),
        status: "extracted",
      });
    }
  }
  return claims;
}

export function relatedContractIds(doc: Pick<SourceDocument, "title" | "text">): string[] {
  return contractIds(`${doc.title}\n${doc.text}`).related;
}

export { HEDGE_RE, CHANGE_RE };
