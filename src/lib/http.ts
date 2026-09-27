import { ZodError } from "zod";
import { GbrainError } from "./gbrain/client";
import { ReviewError } from "./engine/review";

/** Uniform JSON error handling for route handlers. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: `Invalid request: ${e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` }, { status: 400 });
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof GbrainError) return Response.json({ error: `GBrain (${e.tool}${e.code ? `/${e.code}` : ""}): ${e.message}` }, { status: 502 });
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
