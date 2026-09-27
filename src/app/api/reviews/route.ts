import { listReviews } from "@/lib/engine/review";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(async () => ({ items: await listReviews() }));
}
