import { SCENARIOS } from "@/lib/demo";

export async function GET() {
  return Response.json({ scenarios: SCENARIOS });
}
