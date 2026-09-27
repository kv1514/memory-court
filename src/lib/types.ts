// Shared domain + API contract for Memory Court.
// Backend (src/lib/**, src/app/api/**) and dashboard (src/components/**) both import from here.

export type ValueKind = "money" | "quantity" | "duration" | "percent" | "date" | "text";

/** A claim value after unit/currency/date normalization. */
export interface NormalizedValue {
  kind: ValueKind;
  /** Canonical numeric amount: money in currency units per `period`, quantity in base SI unit, duration in days. */
  amount?: number;
  currency?: string; // ISO code, money only
  unit?: string; // canonical unit ("kg", "m", "l", "day", "%")
  period?: "one_time" | "month" | "year";
  text?: string; // text values and ISO dates
  display: string; // human-readable normalized form, e.g. "$42,000 / year"
}

/** Document stage drives binding-ness and negotiation reasoning. */
export type DocStage =
  | "quote"
  | "proposal"
  | "draft"
  | "signed"
  | "amendment"
  | "policy"
  | "record"
  | "message"
  | "unknown";

export interface InjectionMatch {
  pattern: string;
  excerpt: string;
  start: number;
  end: number;
}

export interface InjectionScan {
  flagged: boolean;
  score: number; // 0..1
  matches: InjectionMatch[];
}

export interface SourceDocument {
  id: string; // D-xxxxxx
  title: string;
  stage: DocStage;
  author?: string;
  documentDate?: string; // YYYY-MM-DD, as stated by the document
  receivedAt: string; // ISO timestamp when Memory Court observed it
  text: string;
  sha256: string;
  injection: InjectionScan;
  /** Every uploaded document is untrusted data; it never carries instructions. */
  trust: "untrusted";
}

export type ClaimStatus =
  | "extracted" // produced by an extractor, not yet judged
  | "supported" // passed evidence checks
  | "unsupported" // failed grounding / hedged / no attribution
  | "quarantined" // came from a document flagged for prompt injection
  | "pending_review" // waiting in the review queue
  | "committed" // written to GBrain
  | "corroborated" // matched an existing memory; linked as extra evidence
  | "rejected" // reviewer rejected it
  | "superseded" // an approved correction replaced it
  | "historical"; // retained, but no longer current (circumstances changed)

export interface Claim {
  id: string; // C-xxxxxx
  documentId: string;
  subject: { slug: string; name: string; matchedAlias?: string };
  predicate: string; // canonical, e.g. "contract.annual_value"
  predicateLabel: string; // human label, e.g. "annual contract value"
  value: NormalizedValue;
  rawValue: string; // exactly as written in the document
  qualifiers: { contractId?: string; stage?: DocStage; scope?: string };
  excerpt: string; // exact evidence snippet (verbatim substring of the source)
  excerptStart: number;
  excerptEnd: number;
  observedAt: string; // ISO timestamp
  documentDate?: string; // YYYY-MM-DD
  effectiveFrom?: string; // YYYY-MM-DD
  effectiveTo?: string; // YYYY-MM-DD (set when a later claim supersedes it in time)
  confidence: number; // extraction confidence 0..1 (NOT verification)
  extractor: string; // "rules@1" | "llm:<model>"
  hedged: boolean;
  status: ClaimStatus;
  gbrainFactId?: string; // id returned by GBrain `remember`
}

export type FindingType =
  | "contradiction"
  | "legitimate_update"
  | "stale_incoming"
  | "corroboration"
  | "new_fact"
  | "distinct_scope"
  | "distinct_entity"
  | "unsupported"
  | "prompt_injection";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type ReviewAction = "approve_correction" | "reject" | "retain_both";
export type RecommendedAction = ReviewAction | "commit" | "hold" | "none";

export interface Evidence {
  side: "incoming" | "memory";
  claimId?: string;
  gbrainFactId?: string;
  documentId?: string;
  documentTitle?: string;
  stage?: DocStage;
  date?: string;
  excerpt: string;
  valueDisplay?: string;
  provenance?: string;
}

export interface Check {
  name: string; // e.g. "excerpt_grounded", "value_in_excerpt", "same_contract"
  passed: boolean;
  detail: string;
  deterministic: boolean; // false only for LLM-produced judgments
}

export interface Finding {
  id: string; // F-xxxxxx
  runId: string;
  type: FindingType;
  severity: Severity;
  raisedBy: "researcher" | "skeptic";
  title: string;
  claimId: string;
  memoryClaimId?: string;
  gbrainFactId?: string;
  rationale: string[];
  evidence: Evidence[];
  checks: Check[];
  /** 0 = certain, 1 = no idea. Derived from failed/contested checks, never from an LLM saying "true". */
  uncertainty: number;
  recommendedAction: RecommendedAction;
}

export interface GbrainWrite {
  op: string; // remember | forget | put_page | add_timeline_entry | add_link
  args: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
  at: string;
}

export interface ReviewDecision {
  action: ReviewAction;
  reviewer: string;
  note?: string;
  at: string;
  writes: GbrainWrite[];
}

export interface ReviewItem {
  id: string; // R-xxxxxx
  runId: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "retained";
  classification: FindingType;
  severity: Severity;
  title: string;
  claimId: string;
  findingIds: string[];
  memoryClaimId?: string;
  gbrainFactId?: string; // the existing GBrain fact under dispute (if any)
  recommended: RecommendedAction;
  allowedActions: ReviewAction[];
  decision?: ReviewDecision;
}

export interface TraceStep {
  step: "scan" | "extract" | "retrieve" | "normalize" | "compare" | "skeptic" | "decide" | "commit";
  role: "system" | "researcher" | "skeptic";
  label: string;
  detail: string;
  status: "ok" | "warn" | "error";
  ms: number;
  data?: unknown;
}

export interface IngestResult {
  runId: string;
  document: SourceDocument;
  claims: Claim[];
  findings: Finding[];
  reviewItems: ReviewItem[];
  committed: GbrainWrite[];
  trace: TraceStep[];
}

/** A fact as GBrain returns it from `recall` (fields named as in the MEMORY_VERBS v1 envelope). */
export interface MemoryFact {
  factId: string;
  text: string;
  entitySlug: string | null;
  kind: string;
  validFrom: string | null;
  validUntil: string | null;
  expiredAt: string | null;
  supersededBy: string | null;
  provenance: string | null;
  confidence: number | null;
  createdAt: string | null;
  /** Parsed from the Memory Court tag embedded in the fact text (null for foreign facts). */
  mc: {
    claimId?: string;
    predicate?: string;
    value?: string;
    stage?: string;
    contract?: string;
    effective?: string;
  } | null;
}

export interface AuditEvent {
  seq: number;
  at: string;
  actor: "system" | "researcher" | "skeptic" | "reviewer" | "gbrain" | "security";
  type: string; // e.g. "document.received", "claim.extracted", "finding.raised", "review.decided", "gbrain.write"
  summary: string;
  refs: Record<string, string | undefined>;
  data?: unknown;
  prevHash: string;
  hash: string; // sha256(prevHash + canonical JSON of the event) — tamper-evident chain
}

// ---------- API payloads ----------

export interface StatusResponse {
  gbrain: {
    connected: boolean;
    version?: string;
    engine?: string;
    home: string;
    tools?: number;
    error?: string;
    stderrTail?: string[];
  };
  extractor: { mode: "rules" | "llm"; model?: string; llmConfigured: boolean };
  counts: { documents: number; claims: number; pendingReviews: number; auditEvents: number };
}

export interface MemoriesResponse {
  entities: { slug: string; name: string }[];
  memories: MemoryFact[]; // live from GBrain recall (active + expired when includeExpired)
  fetchedAt: string;
  source: "gbrain.recall";
}

export interface ReviewItemView extends ReviewItem {
  claim: Claim;
  document: Pick<SourceDocument, "id" | "title" | "stage" | "documentDate" | "injection">;
  memoryClaim?: Claim;
  memoryFact?: MemoryFact;
  findings: Finding[];
}

export interface ReviewsResponse {
  items: ReviewItemView[];
}

export interface DecisionRequest {
  action: ReviewAction;
  note?: string;
  reviewer?: string;
  /** Required to approve a claim that came from a quarantined (injection-flagged) document. */
  overrideQuarantine?: boolean;
}

export interface DecisionResponse {
  item: ReviewItemView;
  writes: GbrainWrite[];
}

export interface AuditResponse {
  events: AuditEvent[];
  chainValid: boolean;
  total: number;
}

export interface AskResponse {
  question: string;
  entity?: { slug: string; name: string };
  predicate?: { id: string; label: string };
  answer: string;
  current?: MemoryFact;
  history: MemoryFact[]; // other matching facts incl. expired/superseded
  retrieval: { tool: "recall"; args: Record<string, unknown>; factCount: number; at: string; ms: number };
  reasoning: string[];
}

export interface TimelineEntry {
  at: string;
  kind: "observed" | "committed" | "corrected" | "retained" | "rejected" | "gbrain_timeline";
  summary: string;
  claimId?: string;
  factId?: string;
  reviewId?: string;
  source?: string;
}

export interface TimelineResponse {
  entity: { slug: string; name: string };
  entries: TimelineEntry[];
}

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  expected: string;
  document: { title: string; text: string; documentDate?: string; author?: string };
}

export interface EvalCaseResult {
  id: string;
  category: string;
  description: string;
  expected: { flag: boolean; type: FindingType | "none"; blockWrite: boolean };
  baseline: { flagged: boolean; wroteToMemory: boolean; type: string };
  memoryCourt: { flagged: boolean; wroteToMemory: boolean; type: string; findingTypes: FindingType[] };
  baselineCorrect: boolean;
  memoryCourtCorrect: boolean;
  notes: string[];
}

export interface EvalMetrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  falsePositives: number;
  unsupportedAccepted: number; // unsupported/injected claims that reached memory
  unsafeWritesBlocked: number;
  accuracy: number;
}

export interface EvalReport {
  generatedAt: string;
  extractor: string;
  gbrainHome: string;
  cases: EvalCaseResult[];
  baseline: EvalMetrics;
  memoryCourt: EvalMetrics;
  durationMs: number;
}
