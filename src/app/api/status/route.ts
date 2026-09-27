import type { StatusResponse } from "@/lib/types";
import { connectionInfo, getConn } from "@/lib/gbrain/client";
import { db, readAudit } from "@/lib/store";
import { ANTHROPIC_MODEL, llmConfigured } from "@/lib/config";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(async (): Promise<StatusResponse> => {
    let engine: string | undefined;
    try {
      await getConn();
      engine = "pglite";
    } catch {
      /* reported via connectionInfo().error */
    }
    const info = connectionInfo();
    const s = db();
    return {
      gbrain: { ...info, engine },
      extractor: { mode: llmConfigured() ? "llm" : "rules", model: llmConfigured() ? ANTHROPIC_MODEL : undefined, llmConfigured: llmConfigured() },
      counts: {
        documents: Object.keys(s.documents).length,
        claims: Object.keys(s.claims).length,
        pendingReviews: Object.values(s.reviews).filter((r) => r.status === "pending").length,
        auditEvents: readAudit(1).total,
      },
    };
  });
}
