import { z } from "zod";
import { ask } from "@/lib/engine/ask";
import { body, handle } from "@/lib/http";

const AskInput = z.object({ question: z.string().trim().min(3).max(500) });

export async function POST(req: Request) {
  const raw = await body(req);
  return handle(async () => ask(AskInput.parse(raw).question));
}
