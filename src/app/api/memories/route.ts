import type { MemoriesResponse, MemoryFact } from "@/lib/types";
import * as gb from "@/lib/gbrain/client";
import { toMemoryFact, displayFactText } from "@/lib/engine/facts";
import { registryEntity } from "@/lib/entities";
import { db } from "@/lib/store";
import { handle } from "@/lib/http";

export async function GET(req: Request) {
  return handle(async (): Promise<MemoriesResponse> => {
    const includeExpired = new URL(req.url).searchParams.get("includeExpired") === "1";
    // Live read from GBrain: one recall per known entity (exact slug), so the feed reflects the brain, not local state.
    const slugs = new Set<string>(Object.values(db().claims).map((c) => c.subject.slug));
    const all = await gb.recall({ include_expired: includeExpired, limit: 100 });
    for (const f of all.facts) if (f.entity_slug) slugs.add(f.entity_slug);
    const memories: MemoryFact[] = [];
    const seen = new Set<string>();
    for (const slug of slugs) {
      const r = await gb.recall({ entity: slug, include_expired: includeExpired, limit: 100 });
      for (const f of r.facts.map(toMemoryFact)) {
        if (f.entitySlug !== slug || seen.has(f.factId)) continue;
        seen.add(f.factId);
        memories.push(f);
      }
    }
    memories.sort((a, b) => Number(b.factId) - Number(a.factId));
    const entities = [...new Set(memories.map((m) => m.entitySlug).filter(Boolean) as string[])].map((slug) => ({
      slug,
      name: registryEntity(slug)?.name ?? displayFactText(memories.find((m) => m.entitySlug === slug)?.text ?? slug).split(" — ")[0],
    }));
    return { entities, memories, fetchedAt: new Date().toISOString(), source: "gbrain.recall" };
  });
}
