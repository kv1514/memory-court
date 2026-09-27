import { z } from "zod";
import { ask } from "@/lib/engine/ask";
import { body, handle } from "@/lib/http";
import { disconnect, getConn } from "@/lib/gbrain/client";

const AskInput = z.object({ question: z.string().trim().min(3).max(500), fresh: z.boolean().optional() });

export async function POST(req: Request) {
  const raw = await body(req);
  return handle(async () => {
    const input = AskInput.parse(raw);
    // fresh=true kills the app's GBrain MCP server process and spawns a new one before answering:
    // the answer can only come from what GBrain persisted on disk.
    if (input.fresh) await disconnect();
    const res = await ask(input.question);
    const conn = await getConn();
    return { ...res, retrieval: { ...res.retrieval, freshProcess: Boolean(input.fresh), serverPid: conn.transport.pid ?? undefined } };
  });
}
