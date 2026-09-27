import { decide } from "@/lib/engine/review";
import { body, handle } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = (await body(req)) as Parameters<typeof decide>[1];
  return handle(() => decide(id, input));
}
