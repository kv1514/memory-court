// Setup check: `npm run doctor`. Verifies Bun, GBrain and Node, and that GBrain's MCP server answers.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

async function main() {
  const { BUN_BIN, GBRAIN_BIN, GBRAIN_HOME, llmConfigured } = await import("../src/lib/config");
  let ok = true;
  const line = (pass: boolean, label: string, hint = "") => {
    if (!pass) ok = false;
    console.log(`${pass ? "✓" : "✗"} ${label}${!pass && hint ? `\n    → ${hint}` : ""}`);
  };
  const [major] = process.versions.node.split(".").map(Number);
  line(major >= 22, `Node ${process.versions.node} (need ≥ 22)`, "install Node 22+ from nodejs.org");
  line(fs.existsSync(BUN_BIN), `Bun at ${BUN_BIN}`, "curl -fsSL https://bun.sh/install | bash   (or set MEMORY_COURT_BUN)");
  line(fs.existsSync(GBRAIN_BIN), `GBrain at ${GBRAIN_BIN}`, "bun install -g github:garrytan/gbrain#latest-stable   (NOT the npm package named gbrain)");
  if (fs.existsSync(BUN_BIN) && fs.existsSync(GBRAIN_BIN)) {
    try {
      const v = execFileSync(BUN_BIN, [GBRAIN_BIN, "--version"], { encoding: "utf8" }).trim();
      line(/gbrain/.test(v), `GBrain CLI responds: ${v}`);
    } catch (e) {
      line(false, "GBrain CLI responds", (e as Error).message.slice(0, 200));
    }
    const gb = await import("../src/lib/gbrain/client");
    try {
      const conn = await gb.getConn();
      line(conn.tools.length > 0, `GBrain MCP server up (${conn.tools.length} tools) · brain at ${GBRAIN_HOME}`);
      await gb.disconnect();
    } catch (e) {
      line(false, "GBrain MCP server", `${(e as Error).message.slice(0, 300)}\n    (If the app is running it owns the PGLite brain — stop it first.)`);
    }
  }
  console.log(`${llmConfigured() ? "✓" : "·"} LLM extractor ${llmConfigured() ? "enabled (ANTHROPIC_API_KEY set)" : "off — deterministic extractor will be used (optional: set ANTHROPIC_API_KEY in .env.local)"}`);
  console.log(ok ? "\nReady: npm run dev → http://localhost:3000 → Reset demo" : "\nFix the ✗ items above.");
  process.exit(ok ? 0 : 1);
}
main();
