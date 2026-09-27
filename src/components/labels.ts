import type {
  AuditEvent,
  ClaimStatus,
  DocStage,
  FindingType,
  RecommendedAction,
  ReviewItem,
  Severity,
  TimelineEntry,
  TraceStep,
} from "@/lib/types";
import type { IconName, Tone } from "./ui";

// Lookups tolerate values outside the unions (the backend evolves concurrently).
function look<V>(map: Record<string, V>, key: string | null | undefined, fallback: V): V {
  if (!key) return fallback;
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
}

const FINDING_TONE: Record<FindingType, Tone> = {
  contradiction: "rose",
  legitimate_update: "amber",
  stale_incoming: "orange",
  corroboration: "emerald",
  new_fact: "sky",
  distinct_scope: "slate",
  distinct_entity: "slate",
  unsupported: "yellow",
  prompt_injection: "red",
};

const FINDING_LABEL: Record<FindingType, string> = {
  contradiction: "Contradiction",
  legitimate_update: "Legitimate update",
  stale_incoming: "Stale incoming",
  corroboration: "Corroboration",
  new_fact: "New fact",
  distinct_scope: "Distinct scope",
  distinct_entity: "Distinct entity",
  unsupported: "Unsupported",
  prompt_injection: "Prompt injection",
};

export const findingTone = (t: string) => look<Tone>(FINDING_TONE, t, "zinc");
export const findingLabel = (t: string) => look<string>(FINDING_LABEL, t, t.replace(/_/g, " "));

const SEVERITY_TONE: Record<Severity, Tone> = {
  info: "slate",
  low: "sky",
  medium: "amber",
  high: "rose",
  critical: "red",
};
const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEVERITY_BORDER: Record<Severity, string> = {
  info: "border-l-slate-500",
  low: "border-l-sky-500",
  medium: "border-l-amber-500",
  high: "border-l-rose-500",
  critical: "border-l-red-500",
};

export const sevTone = (s: string) => look<Tone>(SEVERITY_TONE, s, "zinc");
export const sevRank = (s: string) => look<number>(SEVERITY_RANK, s, 0);
export const sevBorder = (s: string) => look<string>(SEVERITY_BORDER, s, "border-l-zinc-600");

const CLAIM_STATUS_TONE: Record<ClaimStatus, Tone> = {
  extracted: "zinc",
  supported: "sky",
  unsupported: "yellow",
  quarantined: "red",
  pending_review: "amber",
  committed: "emerald",
  corroborated: "teal",
  rejected: "rose",
  superseded: "slate",
  historical: "slate",
};
export const claimStatusTone = (s: string) => look<Tone>(CLAIM_STATUS_TONE, s, "zinc");

const ROLE_TONE: Record<TraceStep["role"], Tone> = { system: "zinc", researcher: "sky", skeptic: "violet" };
export const roleTone = (r: string) => look<Tone>(ROLE_TONE, r, "zinc");

const ACTOR_TONE: Record<AuditEvent["actor"], Tone> = {
  system: "zinc",
  researcher: "sky",
  skeptic: "violet",
  reviewer: "amber",
  gbrain: "emerald",
  security: "red",
};
export const actorTone = (a: string) => look<Tone>(ACTOR_TONE, a, "zinc");

const ACTION_LABEL: Record<RecommendedAction, string> = {
  approve_correction: "Approve correction",
  reject: "Reject",
  retain_both: "Retain both",
  commit: "Commit to memory",
  hold: "Hold for review",
  none: "No action",
};
export const actionLabel = (a: string) => look<string>(ACTION_LABEL, a, a.replace(/_/g, " "));

/** Button wording depends on what the finding means: a legitimate update is approved by keeping history. */
export const actionLabelFor = (a: string, classification?: string) => {
  if (classification === "legitimate_update") {
    if (a === "retain_both") return "Approve update · keep history";
    if (a === "approve_correction") return "Replace (treat old as wrong)";
  }
  if (classification === "stale_incoming" && a === "retain_both") return "Keep as history";
  if ((classification === "prompt_injection" || classification === "unsupported") && a === "approve_correction") return "Accept anyway";
  return actionLabel(a);
};

const REVIEW_STATUS_TONE: Record<ReviewItem["status"], Tone> = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
  retained: "slate",
};
export const reviewStatusTone = (s: string) => look<Tone>(REVIEW_STATUS_TONE, s, "zinc");

const STAGE_TONE: Record<DocStage, Tone> = {
  quote: "zinc",
  proposal: "zinc",
  draft: "zinc",
  signed: "indigo",
  amendment: "indigo",
  policy: "teal",
  record: "teal",
  message: "zinc",
  unknown: "zinc",
};
export const stageTone = (s: string) => look<Tone>(STAGE_TONE, s, "zinc");

const TRACE_STATUS_TONE: Record<TraceStep["status"], Tone> = { ok: "emerald", warn: "amber", error: "rose" };
export const traceStatusTone = (s: string) => look<Tone>(TRACE_STATUS_TONE, s, "zinc");

export interface TimelineMeta {
  tone: Tone;
  label: string;
  icon: IconName;
}
const TIMELINE_META: Record<TimelineEntry["kind"], TimelineMeta> = {
  observed: { tone: "sky", label: "Observed", icon: "eye" },
  committed: { tone: "emerald", label: "Committed to GBrain", icon: "check" },
  corrected: { tone: "amber", label: "Corrected", icon: "refresh" },
  retained: { tone: "slate", label: "Retained both", icon: "merge" },
  rejected: { tone: "rose", label: "Rejected", icon: "x" },
  gbrain_timeline: { tone: "violet", label: "GBrain page timeline", icon: "database" },
};
export const timelineMeta = (k: string) =>
  look<TimelineMeta>(TIMELINE_META, k, { tone: "zinc", label: k.replace(/_/g, " "), icon: "diamond" });
