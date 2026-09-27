// Durable local audit store: a JSON snapshot (atomic rename) + an append-only, hash-chained JSONL audit log.
// GBrain holds the agent's memory; this store holds Memory Court's structured claim metadata, findings,
// review decisions and provenance, linked to GBrain fact ids.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AuditEvent, Claim, Finding, ReviewItem, SourceDocument, TraceStep } from "./types";
import { AUDIT_FILE, DATA_DIR, STORE_FILE } from "./config";

export interface RunRecord {
  id: string;
  documentId: string;
  at: string;
  claimIds: string[];
  findingIds: string[];
  reviewIds: string[];
  trace: TraceStep[];
}

export interface StoreData {
  version: 1;
  documents: Record<string, SourceDocument>;
  claims: Record<string, Claim>;
  findings: Record<string, Finding>;
  reviews: Record<string, ReviewItem>;
  runs: Record<string, RunRecord>;
  /** GBrain fact id → Memory Court claim id */
  factIndex: Record<string, string>;
}

const empty = (): StoreData => ({ version: 1, documents: {}, claims: {}, findings: {}, reviews: {}, runs: {}, factIndex: {} });

type G = typeof globalThis & { __memoryCourtStore?: { data: StoreData; seq: number; lastHash: string; file: string } };
const g = globalThis as G;

function files() {
  return { store: process.env.MEMORY_COURT_STORE_FILE ?? STORE_FILE, audit: process.env.MEMORY_COURT_AUDIT_FILE ?? AUDIT_FILE };
}

function load() {
  const f = files();
  if (g.__memoryCourtStore && g.__memoryCourtStore.file === f.store) return g.__memoryCourtStore;
  fs.mkdirSync(path.dirname(f.store), { recursive: true });
  let data = empty();
  if (fs.existsSync(f.store)) data = { ...empty(), ...(JSON.parse(fs.readFileSync(f.store, "utf8")) as StoreData) };
  let seq = 0;
  let lastHash = "GENESIS";
  if (fs.existsSync(f.audit)) {
    const lines = fs.readFileSync(f.audit, "utf8").trim().split("\n").filter(Boolean);
    const last = lines.length ? (JSON.parse(lines[lines.length - 1]) as AuditEvent) : undefined;
    if (last) {
      seq = last.seq;
      lastHash = last.hash;
    }
  }
  g.__memoryCourtStore = { data, seq, lastHash, file: f.store };
  return g.__memoryCourtStore;
}

export function db(): StoreData {
  return load().data;
}

export function save(): void {
  const f = files();
  const tmp = `${f.store}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(load().data));
  fs.renameSync(tmp, f.store);
}

function canonical(e: Omit<AuditEvent, "hash">): string {
  return JSON.stringify([e.seq, e.at, e.actor, e.type, e.summary, e.refs, e.data ?? null, e.prevHash]);
}

export function audit(actor: AuditEvent["actor"], type: string, summary: string, refs: AuditEvent["refs"] = {}, data?: unknown): AuditEvent {
  const s = load();
  const base = { seq: s.seq + 1, at: new Date().toISOString(), actor, type, summary, refs, data, prevHash: s.lastHash };
  const hash = crypto.createHash("sha256").update(canonical(base)).digest("hex");
  const ev: AuditEvent = { ...base, hash };
  fs.appendFileSync(files().audit, JSON.stringify(ev) + "\n");
  s.seq = ev.seq;
  s.lastHash = hash;
  return ev;
}

export function readAudit(limit = 200): { events: AuditEvent[]; chainValid: boolean; total: number } {
  const f = files().audit;
  if (!fs.existsSync(f)) return { events: [], chainValid: true, total: 0 };
  const events = fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditEvent);
  let prev = "GENESIS";
  let chainValid = true;
  for (const e of events) {
    const { hash, ...rest } = e;
    const recomputed = crypto.createHash("sha256").update(canonical(rest)).digest("hex");
    if (e.prevHash !== prev || recomputed !== hash) {
      chainValid = false;
      break;
    }
    prev = hash;
  }
  return { events: events.slice(-limit).reverse(), chainValid, total: events.length };
}

/** Wipes Memory Court's local state (used by demo reset; GBrain is reset separately). */
export function resetStore(): void {
  const f = files();
  for (const p of [f.store, f.audit]) if (fs.existsSync(p)) fs.rmSync(p);
  delete g.__memoryCourtStore;
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 6)}`;
