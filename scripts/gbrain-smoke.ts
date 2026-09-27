// Phase 1 check: real GBrain connectivity through MCP (isolated brain under $TMPDIR).
import path from "node:path";
async function main() {
process.env.MEMORY_COURT_GBRAIN_HOME ??= path.join(process.env.TMPDIR ?? "/tmp", "mc-smoke-home");
const g = await import("../src/lib/gbrain/client");
const t0 = Date.now();
const init = await g.ensureBrain(process.env.MEMORY_COURT_GBRAIN_HOME);
console.log("ensureBrain", init.created ? "created" : "existing", Date.now() - t0, "ms");
const conn = await g.getConn();
console.log("connected; tools:", conn.tools.length, "version:", conn.version);
const r = await g.remember({ fact: "Smoke Co annual fee is $1,000 per year", provenance: "memory-court smoke test", entity: "companies/smoke-co" });
console.log("remember ->", r.id, r.status, r.entity_slug);
const rc = await g.recall({ entity: "companies/smoke-co" });
console.log("recall ->", rc.facts.map((f) => `#${f.id} ${f.fact} expired=${f.expired_at}`));
const f = await g.forget(r.id, "smoke test cleanup");
console.log("forget ->", f);
const rc2 = await g.recall({ entity: "companies/smoke-co", include_expired: true });
console.log("recall(include_expired) ->", rc2.facts.map((x) => `#${x.id} expired=${x.expired_at}`));
try {
  const p = await g.putPage("companies/smoke-co", "---\ntype: company\ntitle: Smoke Co\n---\n# Smoke Co\n\nTest page.\n");
  console.log("put_page ->", JSON.stringify(p).slice(0, 200));
  const tl = await g.addTimelineEntry("companies/smoke-co", "2026-09-27", "Smoke test timeline entry", "detail", "memory-court");
  console.log("add_timeline_entry ->", JSON.stringify(tl).slice(0, 200));
  console.log("get_timeline ->", JSON.stringify(await g.getTimeline("companies/smoke-co")).slice(0, 300));
} catch (e) { console.log("page ops error:", (e as Error).message); }
await g.disconnect();
console.log("total", Date.now() - t0, "ms");
process.exit(0);
}
main().catch((e) => { console.error("SMOKE FAILED:", e); process.exit(1); });
