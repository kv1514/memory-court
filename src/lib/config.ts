import path from "node:path";
import os from "node:os";

const root = process.env.MEMORY_COURT_ROOT ?? process.cwd();

/** Directory for Memory Court's own durable state (audit log, claim store) and the demo GBrain home. */
export const DATA_DIR = process.env.MEMORY_COURT_DATA_DIR ?? path.join(root, ".data");

/**
 * GBRAIN_HOME is the PARENT of `.gbrain` (per GBrain docs). Memory Court uses its own brain by default
 * so the demo never touches the operator's personal brain; point it at $HOME to use that brain instead.
 */
// GBrain refuses to create its content root inside another Git worktree, so the brain lives outside the repo.
export const GBRAIN_HOME = process.env.MEMORY_COURT_GBRAIN_HOME ?? path.join(os.homedir(), ".memory-court", "gbrain-home");

export const BUN_BIN = process.env.MEMORY_COURT_BUN ?? path.join(os.homedir(), ".bun", "bin", "bun");
export const GBRAIN_BIN = process.env.MEMORY_COURT_GBRAIN ?? path.join(os.homedir(), ".bun", "bin", "gbrain");

export const STORE_FILE = path.join(DATA_DIR, "court-store.json");
export const AUDIT_FILE = path.join(DATA_DIR, "audit.jsonl");
export const EVAL_REPORT_FILE = path.join(DATA_DIR, "eval-report.json");

export const ANTHROPIC_MODEL = process.env.MEMORY_COURT_MODEL ?? "claude-sonnet-5";

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
