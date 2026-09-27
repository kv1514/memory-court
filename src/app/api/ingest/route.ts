import { ingest } from "@/lib/engine/pipeline";
import { body, handle } from "@/lib/http";

export async function POST(req: Request) {
  const input = (await body(req)) as Parameters<typeof ingest>[0];
  return handle(() => ingest(input));
}
