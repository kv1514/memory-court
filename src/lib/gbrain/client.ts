// GBrain integration over its documented MCP stdio server (`gbrain serve`).
// Tool names and argument shapes follow GBrain's MEMORY_VERBS v1 protocol and the live `tools/list`
// schema (remember / recall / forget / entity / put_page / get_page / add_timeline_entry / get_timeline / add_link).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { BUN_BIN, GBRAIN_BIN, GBRAIN_HOME } from "../config";

export class GbrainError extends Error {
  constructor(
    message: string,
    public readonly tool: string,
    public readonly code?: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "GbrainError";
  }
}

interface Conn {
  client: Client;
  transport: StdioClientTransport;
  home: string;
  version?: string;
  tools: string[];
  stderr: string[];
  queue: Promise<unknown>;
}

type G = typeof globalThis & { __memoryCourtGbrain?: { conn?: Conn; connecting?: Promise<Conn>; lastError?: string } };
const g = globalThis as G;
g.__memoryCourtGbrain ??= {};
const state = g.__memoryCourtGbrain;

/** GBrain refuses content roots with symlinked components (e.g. macOS /tmp), so always pass a realpath. */
export function realHome(home = GBRAIN_HOME): string {
  fs.mkdirSync(home, { recursive: true });
  return fs.realpathSync(home);
}

function gbrainEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;
  return {
    ...env,
    GBRAIN_HOME: home,
    GBRAIN_NO_AUTOPILOT_INSTALL: "1",
    GBRAIN_NO_ONBOARD_NUDGE: "1",
    GBRAIN_NO_REEMBED: "1",
    PATH: `${path.dirname(BUN_BIN)}:${env.PATH ?? "/usr/bin:/bin"}`,
  };
}

function run(cmd: string, args: string[], env: Record<string, string>, timeoutMs = 180_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] as const });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(cmd)} ${args.join(" ")} timed out`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out });
    });
  });
}

/** Creates a keyless PGLite brain in `home` if none exists (GBrain's documented zero-config init). */
export async function ensureBrain(homeIn = GBRAIN_HOME): Promise<{ created: boolean; output?: string }> {
  const home = realHome(homeIn);
  if (fs.existsSync(path.join(home, ".gbrain", "config.json"))) return { created: false };
  const { code, out } = await run(BUN_BIN, [GBRAIN_BIN, "init", "--pglite", "--no-embedding", "--non-interactive"], gbrainEnv(home));
  if (code !== 0) throw new GbrainError(`gbrain init failed (exit ${code}): ${out.slice(-800)}`, "init");
  return { created: true, output: out };
}

export async function gbrainVersion(): Promise<string | undefined> {
  try {
    const { out } = await run(BUN_BIN, [GBRAIN_BIN, "--version"], gbrainEnv(GBRAIN_HOME), 30_000);
    return out.trim().split(/\s+/).pop();
  } catch {
    return undefined;
  }
}

async function connect(homeIn: string): Promise<Conn> {
  await ensureBrain(homeIn);
  const home = realHome(homeIn);
  const transport = new StdioClientTransport({
    command: BUN_BIN,
    args: [GBRAIN_BIN, "serve"],
    env: gbrainEnv(home),
    stderr: "pipe",
  });
  const stderr: string[] = [];
  transport.stderr?.on("data", (d: Buffer) => {
    for (const line of d.toString().split("\n")) if (line.trim()) stderr.push(line.slice(0, 400));
    if (stderr.length > 60) stderr.splice(0, stderr.length - 60);
  });
  const client = new Client({ name: "memory-court", version: "0.1.0" });
  await client.connect(transport);
  const listed = await client.listTools();
  const conn: Conn = { client, transport, home, tools: listed.tools.map((t) => t.name), stderr, queue: Promise.resolve() };
  conn.version = await gbrainVersion();
  transport.onclose = () => {
    if (state.conn === conn) state.conn = undefined;
  };
  return conn;
}

export async function getConn(): Promise<Conn> {
  if (state.conn) return state.conn;
  if (!state.connecting) {
    state.connecting = connect(GBRAIN_HOME)
      .then((c) => {
        state.conn = c;
        state.lastError = undefined;
        return c;
      })
      .catch((e: unknown) => {
        state.lastError = e instanceof Error ? e.message : String(e);
        throw e;
      })
      .finally(() => {
        state.connecting = undefined;
      });
  }
  return state.connecting;
}

export async function disconnect(): Promise<void> {
  const c = state.conn;
  state.conn = undefined;
  if (c) await c.transport.close().catch(() => undefined);
}

export function connectionInfo() {
  const c = state.conn;
  return {
    connected: Boolean(c),
    version: c?.version,
    home: GBRAIN_HOME,
    tools: c?.tools.length,
    error: state.lastError,
    stderrTail: c?.stderr.slice(-8),
  };
}

/** Calls one GBrain MCP tool; returns the parsed JSON envelope. Calls are serialized (PGLite is single-writer). */
export async function callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const conn = await getConn();
  const exec = async (): Promise<T> => {
    const res = await conn.client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 });
    const content = (res.content ?? []) as { type: string; text?: string }[];
    const texts = content.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text as string);
    let parsed: unknown = undefined;
    for (const t of texts) {
      try {
        parsed = JSON.parse(t);
        break;
      } catch {
        /* GBrain appends human notices as extra text items; skip them */
      }
    }
    if (res.isError) {
      const env = (parsed ?? {}) as { error?: string; code?: string; message?: string };
      throw new GbrainError(env.message ?? texts.join(" ").slice(0, 500), name, env.error ?? env.code, parsed);
    }
    if (parsed === undefined) throw new GbrainError(`Non-JSON response from ${name}: ${texts.join(" ").slice(0, 300)}`, name);
    return parsed as T;
  };
  const p = conn.queue.then(exec, exec);
  conn.queue = p.catch(() => undefined);
  return p;
}

// ---------- typed memory verbs ----------

const FactSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    fact_id: z.union([z.string(), z.number()]).optional(),
    fact: z.string(),
    kind: z.string().nullish(),
    entity_slug: z.string().nullish(),
    valid_from: z.string().nullish(),
    valid_until: z.string().nullish(),
    expired_at: z.string().nullish(),
    superseded_by: z.union([z.string(), z.number()]).nullish(),
    provenance: z.string().nullish(),
    source: z.string().nullish(),
    confidence: z.number().nullish(),
    created_at: z.string().nullish(),
  })
  .passthrough();
export type RawFact = z.infer<typeof FactSchema>;

const RecallSchema = z
  .object({
    facts: z.array(FactSchema).default([]),
    total: z.number().optional(),
    protocol_version: z.number().optional(),
  })
  .passthrough();

const RememberSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    status: z.string(),
    entity_slug: z.string().nullish(),
    valid_until: z.string().nullish(),
  })
  .passthrough();

const ForgetSchema = z.object({ id: z.union([z.string(), z.number()]), expired: z.boolean(), reason: z.string().nullish() }).passthrough();

export interface RecallArgs {
  entity?: string;
  query?: string;
  grep?: string;
  include_expired?: boolean;
  limit?: number;
  since?: string;
}

export async function recall(args: RecallArgs) {
  const raw = await callTool("recall", { limit: 100, ...args });
  return RecallSchema.parse(raw);
}

export interface RememberArgs {
  fact: string;
  provenance: string;
  entity?: string;
  kind?: "event" | "preference" | "commitment" | "belief" | "fact";
  ttl?: string;
  request_id?: string;
}

export async function remember(args: RememberArgs) {
  if (args.provenance.length > 500) args = { ...args, provenance: args.provenance.slice(0, 497) + "..." };
  const raw = await callTool("remember", { ...args });
  const r = RememberSchema.parse(raw);
  return { ...r, id: String(r.id), raw };
}

export async function forget(id: string, reason: string, request_id?: string) {
  const raw = await callTool("forget", { id, reason: reason.slice(0, 480), ...(request_id ? { request_id } : {}) });
  return ForgetSchema.parse(raw);
}

export async function getPage(slug: string): Promise<{ found: boolean; page?: Record<string, unknown> }> {
  try {
    const page = await callTool<Record<string, unknown>>("get_page", { slug });
    return { found: true, page };
  } catch (e) {
    if (e instanceof GbrainError) return { found: false };
    throw e;
  }
}

export async function putPage(slug: string, content: string) {
  return callTool<Record<string, unknown>>("put_page", { slug, content });
}

export async function addTimelineEntry(slug: string, date: string, summary: string, detail?: string, source?: string) {
  return callTool<Record<string, unknown>>("add_timeline_entry", { slug, date, summary, ...(detail ? { detail } : {}), ...(source ? { source } : {}) });
}

export async function getTimeline(slug: string) {
  return callTool<unknown>("get_timeline", { slug, limit: 100 });
}

export async function addLink(from: string, to: string, link_type?: string, context?: string) {
  return callTool<Record<string, unknown>>("add_link", { from, to, ...(link_type ? { link_type } : {}), ...(context ? { context } : {}) });
}

export async function entityCard(name: string) {
  return callTool<Record<string, unknown>>("entity", { name });
}
