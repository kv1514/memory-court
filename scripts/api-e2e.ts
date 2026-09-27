// HTTP end-to-end test against a RUNNING app (dev or production), through the real API routes.
//   phase "run":    reset → main demo (quote → signed) → approve → ask; injection; contradiction → correction
//   phase "verify": run after restarting the server — answers must still come from GBrain
// Usage: BASE=http://localhost:3000 node --import tsx scripts/api-e2e.ts run|verify
const BASE = process.env.BASE ?? "http://localhost:3000";
let failures = 0;

function check(cond: unknown, label: string, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}

async function api<T = any>(path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as T };
}

async function scenario(id: string) {
  const { json } = await api<{ scenarios: { id: string; document: unknown }[] }>("/api/demo/scenarios");
  const s = json.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`scenario ${id} missing`);
  return s.document;
}

async function run() {
  console.log("● reset demo (fresh GBrain brain + seeded memories)");
  const reset = await api("/api/demo/reset", {});
  check(reset.status === 200 && reset.json.ok, "reset ok", reset.json);
  const status = await api("/api/status");
  check(status.json.gbrain.connected && status.json.gbrain.tools > 100, `GBrain connected (v${status.json.gbrain.version}, ${status.json.gbrain.tools} MCP tools)`);
  const mem0 = await api("/api/memories?includeExpired=1");
  const quote = mem0.json.memories.find((m: any) => m.entitySlug === "companies/helios-dental");
  check(quote && /\$5,000/.test(quote.text), "initial GBrain memory: Helios $5,000 (quote)", quote?.text);

  console.log("● main demo: signed $3,000 agreement after the $5,000 quote");
  const a = await api("/api/ingest", await scenario("legit-change"));
  check(a.status === 200, "ingest 200", a.json);
  const item = a.json.reviewItems?.[0];
  check(item?.classification === "legitimate_update", "classified as legitimate update (negotiation history), not contradiction", item?.classification);
  check(!a.json.findings.some((f: any) => f.type === "contradiction"), "no contradiction alert raised");
  check(item?.recommended === "retain_both", "recommends keeping the quote as history + $3,000 as current", item?.recommended);
  check(item?.gbrainFactId === quote?.factId, `review links the existing GBrain fact #${quote?.factId}`);
  const memBefore = await api("/api/memories?includeExpired=1");
  check(memBefore.json.memories.some((m: any) => m.factId === quote.factId && !m.expiredAt), "existing memory NOT expired before approval");
  const dec = await api(`/api/reviews/${item.id}/decision`, { action: "retain_both", reviewer: "api-e2e", note: "signed agreement supersedes quote" });
  check(dec.status === 200, "decision 200", dec.json);
  check(dec.json.item?.decision?.verification?.ok === true, "decision verified by reading GBrain back", dec.json.item?.decision?.verification);
  const again = await api(`/api/reviews/${item.id}/decision`, { action: "retain_both" });
  check(again.status === 409, "repeat decision rejected (409) — no double write", again.status);
  const ask = await api("/api/ask", { question: "What is Helios Dental's current contract value?" });
  check(/\$3,000/.test(ask.json.answer) && /Signed Service Agreement HD-2209/.test(ask.json.answer), "Ask → $3,000 with its source", ask.json.answer);
  check(ask.json.history?.some((f: any) => /\$5,000/.test(f.text)), "quote $5,000 preserved as history");

  console.log("● malicious document");
  const inj = await api("/api/ingest", await scenario("injection"));
  check(inj.json.document?.injection?.flagged === true, "injection flagged + document quarantined");
  const injItem = inj.json.reviewItems?.[0];
  check(injItem?.classification === "prompt_injection", "review item is prompt_injection", injItem?.classification);
  const denied = await api(`/api/reviews/${injItem.id}/decision`, { action: "approve_correction" });
  check(denied.status === 403, "approving without explicit override is refused (403)", denied.status);
  const rej = await api(`/api/reviews/${injItem.id}/decision`, { action: "reject", reviewer: "api-e2e" });
  check(rej.json.item?.decision?.verification?.ok === true, "rejection verified in GBrain (memory unchanged, $0 absent)", rej.json.item?.decision?.verification);

  console.log("● genuine contradiction → approved correction");
  const c = await api("/api/ingest", await scenario("contradiction"));
  const cItem = c.json.reviewItems?.[0];
  check(cItem?.classification === "contradiction" && cItem?.recommended === "approve_correction", "contradiction with recommended correction", cItem);
  const cDec = await api(`/api/reviews/${cItem.id}/decision`, { action: "approve_correction", reviewer: "api-e2e" });
  check(cDec.json.item?.decision?.verification?.ok === true, "old fact expired + new fact active, read back from GBrain", cDec.json.item?.decision?.verification);
  const nw = await api("/api/ask", { question: "What is Northwind Logistics' annual contract value?" });
  check(/\$42,000/.test(nw.json.answer), "Ask → $42,000", nw.json.answer);
  check(nw.json.history?.some((f: any) => f.expiredAt && /\$48,000/.test(f.text)), "old $48,000 fact kept as expired history in GBrain");
}

async function verify() {
  console.log("● fresh application session: answers must come from GBrain");
  const status = await api("/api/status");
  check(status.json.gbrain.connected, "new app process connected to GBrain");
  const h = await api("/api/ask", { question: "What is Helios Dental's current contract value?", fresh: true });
  check(/\$3,000/.test(h.json.answer), "Helios → $3,000 after restart (fresh gbrain serve process)", h.json.answer);
  check(h.json.retrieval?.freshProcess === true && typeof h.json.retrieval?.serverPid === "number", `answered by fresh gbrain serve pid ${h.json.retrieval?.serverPid}`);
  const n = await api("/api/ask", { question: "What is Northwind Logistics' annual contract value?" });
  check(/\$42,000/.test(n.json.answer), "Northwind → $42,000 after restart", n.json.answer);
  const reviews = await api("/api/reviews");
  check(reviews.json.items.filter((i: any) => i.status !== "pending").length >= 3, "review decisions persisted in the audit store");
  const audit = await api("/api/audit?limit=5");
  check(audit.json.chainValid === true && audit.json.total > 20, `audit hash chain valid (${audit.json.total} events)`);
}

const phase = process.argv[2] ?? "run";
(phase === "verify" ? verify() : run())
  .then(() => {
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
    process.exit(failures ? 1 : 0);
  })
  .catch((e) => {
    console.error("api-e2e crashed:", e);
    process.exit(1);
  });
