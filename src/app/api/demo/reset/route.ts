import { resetDemo } from "@/lib/demo";
import { handle } from "@/lib/http";

export async function POST() {
  return handle(async () => ({ ok: true, ...(await resetDemo()) }));
}
