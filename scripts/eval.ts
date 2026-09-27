// Repeatable evaluation: Memory Court vs a no-verification baseline, both against a REAL, isolated GBrain brain.
// Usage: npm run eval   (writes .data/eval-report.json, read by the dashboard)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const t0 = Date.now();
  const root = process.cwd();
  const evalHome = process.env.MEMORY_COURT_EVAL_GBRAIN_HOME ?? path.join(os.homedir(), ".memory-court", "eval-home");
  fs.rmSync(evalHome, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, ".data", "eval"), { recursive: true });
  for (const f of ["court-store.json", "audit.jsonl"]) fs.rmSync(path.join(root, ".data", "eval", f), { force: true });
  process.env.MEMORY_COURT_GBRAIN_HOME = evalHome;
  process.env.MEMORY_COURT_STORE_FILE = path.join(root, ".data", "eval", "court-store.json");
  process.env.MEMORY_COURT_AUDIT_FILE = path.join(root, ".data", "eval", "audit.jsonl");

  const { CASES } = await import("../evals/cases");
  const { ingest, IngestInput } = await import("../src/lib/engine/pipeline");
  const { ALERT_TYPES } = await import("../src/lib/engine/court");
  const { extractClaimsRules, detectStage, RULES_EXTRACTOR } = await import("../src/lib/extract/rules");
  const gb = await import("../src/lib/gbrain/client");
  const { toMemoryFact } = await import("../src/lib/engine/facts");
  const { EVAL_REPORT_FILE } = await import("../src/lib/config");
  type Types = typeof import("../src/lib/types");
  type EvalCaseResult = Types extends never ? never : import("../src/lib/types").EvalCaseResult;
  type EvalMetrics = import("../src/lib/types").EvalMetrics;

  await gb.ensureBrain(evalHome);
  await gb.getConn();

  // ---- baseline: same extractor + same GBrain, but NO verification: no injection screen, loose name retrieval,
  // raw-string value comparison, no temporal/contract/unit reasoning, and every claim is written to memory.
  async function baselineIngest(input: Parameters<typeof IngestInput.parse>[0], ns: string) {
    const p = IngestInput.parse(input);
    const doc = {
      id: `BL-${Math.random().toString(16).slice(2, 8)}`,
      title: p.title,
      stage: detectStage(p.title, p.text),
      documentDate: p.documentDate,
      receivedAt: new Date().toISOString(),
      text: p.text,
      sha256: "",
      injection: { flagged: false, score: 0, matches: [] },
      trust: "untrusted" as const,
      author: p.author,
    };
    const claims = extractClaimsRules(doc).map((c) => ({ ...c, subject: { ...c.subject, slug: `${c.subject.slug}-${ns}` } }));
    let flagged = false;
    let wrote = false;
    for (const c of claims) {
      const token = c.subject.name.split(/\s+/)[0];
      const loose = await gb.recall({ grep: token, limit: 100 });
      for (const f of loose.facts) {
        // namespace lives in the fact text: GBrain canonicalizes entity names, so slugs are not a reliable filter
        const m = f.fact.match(new RegExp(`\\[bl ns=${ns} pred=(\\S+) raw=([^\\]]+)\\]`));
        if (m && m[1] === c.predicate && m[2].trim().toLowerCase() !== c.rawValue.trim().toLowerCase()) flagged = true;
      }
      const r = await gb.remember({ fact: `${c.subject.name} — ${c.predicateLabel}: ${c.rawValue} [bl ns=${ns} pred=${c.predicate} raw=${c.rawValue}]`, provenance: `baseline eval ${doc.title}`.slice(0, 200), entity: c.subject.slug });
      const check = await gb.recall({ entity: c.subject.slug, limit: 100 });
      if (check.facts.some((f) => String(f.id) === r.id)) wrote = true;
    }
    return { flagged, wrote };
  }

  const results: EvalCaseResult[] = [];
  for (const k of CASES) {
    const notes: string[] = [];
    // Memory Court
    const nsM = `${k.id.toLowerCase()}mc`;
    for (const s of k.seeds) await ingest(s, { ns: nsM, extractor: "rules" });
    const run = await ingest(k.incoming, { ns: nsM, extractor: "rules" });
    const mcFlag = run.findings.some((f) => ALERT_TYPES.includes(f.type));
    const lead = run.reviewItems[0]?.classification ?? run.findings.find((f) => f.type !== "distinct_entity")?.type ?? "none";
    let mcWrote = false;
    for (const c of run.claims) {
      const facts = (await gb.recall({ entity: c.subject.slug, limit: 100 })).facts.map(toMemoryFact);
      if (facts.some((f) => f.mc?.claimId === c.id && !f.expiredAt)) mcWrote = true;
    }
    notes.push(`claims: ${run.claims.map((c) => `${c.predicate}=${c.value.display}`).join("; ") || "none"}`);
    notes.push(`findings: ${run.findings.map((f) => f.type).join(", ") || "none"}`);
    // Baseline
    const nsB = `${k.id.toLowerCase()}bl`;
    for (const s of k.seeds) await baselineIngest(s, nsB);
    const bl = await baselineIngest(k.incoming, nsB);

    const mcCorrect = mcFlag === k.expected.flag && (!k.expected.blockWrite || !mcWrote);
    const blCorrect = bl.flagged === k.expected.flag && (!k.expected.blockWrite || !bl.wrote);
    results.push({
      id: k.id,
      category: k.category,
      description: k.description,
      expected: k.expected,
      baseline: { flagged: bl.flagged, wroteToMemory: bl.wrote, type: bl.flagged ? "value mismatch" : "none" },
      memoryCourt: { flagged: mcFlag, wroteToMemory: mcWrote, type: lead, findingTypes: [...new Set(run.findings.map((f) => f.type))] },
      baselineCorrect: blCorrect,
      memoryCourtCorrect: mcCorrect,
      notes,
    });
    console.log(`${k.id} ${k.category.padEnd(38)} expected flag=${k.expected.flag} | MC flag=${mcFlag} type=${lead} wrote=${mcWrote} ${mcCorrect ? "✓" : "✗"} | BL flag=${bl.flagged} wrote=${bl.wrote} ${blCorrect ? "✓" : "✗"}`);
  }

  const metrics = (sel: (r: EvalCaseResult) => { flagged: boolean; wroteToMemory: boolean }, correct: (r: EvalCaseResult) => boolean): EvalMetrics => {
    let tp = 0, fp = 0, fn = 0, tn = 0, unsupportedAccepted = 0, unsafeWritesBlocked = 0;
    for (const r of results) {
      const s = sel(r);
      if (s.flagged && r.expected.flag) tp++;
      else if (s.flagged && !r.expected.flag) fp++;
      else if (!s.flagged && r.expected.flag) fn++;
      else tn++;
      if (["unsupported", "prompt_injection"].includes(r.expected.type)) {
        if (s.wroteToMemory) unsupportedAccepted++;
        else unsafeWritesBlocked++;
      }
    }
    return {
      tp, fp, fn, tn,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      falsePositives: fp,
      unsupportedAccepted,
      unsafeWritesBlocked,
      accuracy: results.filter(correct).length / results.length,
    };
  };

  const report = {
    generatedAt: new Date().toISOString(),
    extractor: RULES_EXTRACTOR,
    gbrainHome: evalHome,
    cases: results,
    baseline: metrics((r) => r.baseline, (r) => r.baselineCorrect),
    memoryCourt: metrics((r) => r.memoryCourt, (r) => r.memoryCourtCorrect),
    durationMs: Date.now() - t0,
  };
  fs.mkdirSync(path.dirname(EVAL_REPORT_FILE), { recursive: true });
  fs.writeFileSync(EVAL_REPORT_FILE, JSON.stringify(report, null, 2));
  const fmt = (m: EvalMetrics) => `precision=${m.precision?.toFixed(2) ?? "n/a"} recall=${m.recall?.toFixed(2) ?? "n/a"} FP=${m.falsePositives} unsupported/injected accepted=${m.unsupportedAccepted} blocked=${m.unsafeWritesBlocked} accuracy=${(m.accuracy * 100).toFixed(0)}%`;
  console.log(`\nBASELINE      ${fmt(report.baseline)}\nMEMORY COURT  ${fmt(report.memoryCourt)}\n${results.length} cases in ${report.durationMs} ms → ${EVAL_REPORT_FILE}`);
  await gb.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("EVAL FAILED:", e);
  process.exit(1);
});
