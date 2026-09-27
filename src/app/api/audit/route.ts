import { readAudit } from "@/lib/store";
import { handle } from "@/lib/http";

export async function GET(req: Request) {
  const limit = Math.min(1000, Number(new URL(req.url).searchParams.get("limit") ?? 200) || 200);
  return handle(async () => readAudit(limit));
}
