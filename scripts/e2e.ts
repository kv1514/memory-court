// End-to-end check of the full workflow against a real, isolated GBrain brain.
import path from "node:path";
import fs from "node:fs";
async function main() {
  const tmp = fs.realpathSync(process.env.TMPDIR ?? "/tmp");
  process.env.MEMORY_COURT_DATA_DIR = path.join(tmp, "mc-e2e");
  process.env.MEMORY_COURT_GBRAIN_HOME = path.join(tmp, "mc-e2e", "gbrain-home");
  process.env.MEMORY_COURT_STORE_FILE = path.join(tmp, "mc-e2e", "court-store.json");
  process.env.MEMORY_COURT_AUDIT_FILE = path.join(tmp, "mc-e2e", "audit.jsonl");
  const { resetDemo, SCENARIOS } = await import("../src/lib/demo");
  const { ingest } = await import("../src/lib/engine/pipeline");
  const { decide } = await import("../src/lib/engine/review");
  const { ask } = await import("../src/lib/engine/ask");
  const { readAudit } = await import("../src/lib/store");
  const gb = await import("../src/lib/gbrain/client");
  const r0 = await resetDemo();
  console.log("reset:", r0);
  const show = (r: any) => {
    console.log(`\n### ${r.document.title}  [${r.document.stage}] injection=${r.document.injection.flagged}`);
    for (const c of r.claims) console.log(`  claim ${c.id} ${c.subject.slug} ${c.predicate} = ${c.value.display} stage=${c.qualifiers.stage} contract=${c.qualifiers.contractId ?? "-"} eff=${c.effectiveFrom} hedged=${c.hedged} → ${c.status}`);
    for (const f of r.findings) console.log(`  finding ${f.type} (${f.severity}, ${f.raisedBy}) rec=${f.recommendedAction} unc=${f.uncertainty} :: ${f.title}`);
    for (const i of r.reviewItems) console.log(`  REVIEW ${i.id} ${i.classification} rec=${i.recommended} allowed=${i.allowedActions.join("/")} fact=${i.gbrainFactId ?? "-"}`);
  };
  console.log("Q1:", (await ask("What is Northwind Logistics' annual contract value?")).answer);
  const results: Record<string, any> = {};
  for (const s of SCENARIOS) { const r = await ingest(s.document, { extractor: "rules" }); results[s.id] = r; show(r); }
  const a = results["contradiction"].reviewItems[0];
  if (a) { const d = await decide(a.id, { action: "approve_correction", reviewer: "e2e", note: "executed agreement is authoritative" }); console.log("\ndecision A writes:", d.writes.map((w: any) => `${w.op}:${w.ok}${w.error ? " " + w.error : ""}`).join(", ")); }
  const b = results["legit-change"].reviewItems[0];
  if (b) { const d = await decide(b.id, { action: "retain_both", reviewer: "e2e" }); console.log("decision B writes:", d.writes.map((w: any) => `${w.op}:${w.ok}`).join(", ")); }
  const inj = results["injection"].reviewItems[0];
  if (inj) { try { await decide(inj.id, { action: "approve_correction" }); console.log("INJECTION APPROVED WITHOUT OVERRIDE — BUG"); } catch (e) { console.log("injection approve without override blocked:", (e as Error).message.slice(0, 80)); } }
  console.log("backlinks(northwind):", JSON.stringify(await gb.callTool("get_backlinks", { slug: "companies/northwind-logistics" })).slice(0, 300));
  await gb.disconnect();
  // restart: new connection, answer must come from GBrain
  const q = await ask("What is Northwind Logistics' annual contract value?");
  console.log("\nQ1 after correction + reconnect:", q.answer); console.log("  reasoning:", q.reasoning.join(" | "));
  console.log("Q2:", (await ask("What did Helios Dental agree to pay?")).answer);
  console.log("Q3:", (await ask("What is Contoso Retail's refund window?")).answer);
  const au = readAudit(5); console.log("\naudit events:", au.total, "chainValid:", au.chainValid);
  await gb.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
