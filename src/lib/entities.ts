// Entity resolution: explicit registry of (fictional) known entities + a conservative pattern for new ones.
// Longest alias wins so "Acme Robotics UK Ltd" never collapses into "Acme Robotics Inc".

export interface EntityDef {
  slug: string;
  name: string;
  aliases: string[];
  type: "company" | "person";
}

export const ENTITY_REGISTRY: EntityDef[] = [
  { slug: "companies/northwind-logistics", name: "Northwind Logistics", aliases: ["Northwind Logistics Inc", "Northwind Logistics", "Northwind"], type: "company" },
  { slug: "companies/helios-dental", name: "Helios Dental Group", aliases: ["Helios Dental Group", "Helios Dental", "Helios"], type: "company" },
  { slug: "companies/contoso-retail", name: "Contoso Retail", aliases: ["Contoso Retail", "Contoso"], type: "company" },
  { slug: "companies/acme-robotics", name: "Acme Robotics Inc", aliases: ["Acme Robotics, Inc.", "Acme Robotics Inc.", "Acme Robotics Inc", "Acme Robotics"], type: "company" },
  { slug: "companies/acme-robotics-uk", name: "Acme Robotics UK Ltd", aliases: ["Acme Robotics (UK) Ltd", "Acme Robotics UK Limited", "Acme Robotics UK Ltd", "Acme Robotics UK"], type: "company" },
  { slug: "companies/vandelay-industries", name: "Vandelay Industries", aliases: ["Vandelay Industries", "Vandelay"], type: "company" },
  { slug: "companies/globex", name: "Globex Corporation", aliases: ["Globex Corporation", "Globex Corp", "Globex"], type: "company" },
  { slug: "companies/initech", name: "Initech", aliases: ["Initech LLC", "Initech"], type: "company" },
  { slug: "companies/pinecrest-clinic", name: "Pinecrest Clinic", aliases: ["Pinecrest Clinic", "Pinecrest"], type: "company" },
];

export interface EntityMention {
  slug: string;
  name: string;
  alias: string;
  start: number;
  end: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,()]/g, "")
    .replace(/\b(inc|llc|ltd|corp|corporation|limited)\b/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const NEW_ENTITY_RE =
  /\b((?:[A-Z][a-zA-Z&'-]+\s){0,3}(?:[A-Z][a-zA-Z&'-]+)\s(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Group|Labs|Clinic|Industries|Logistics|Robotics|Retail|Dental|Health|Systems|Technologies|Software|Bank|Partners))\b/g;

/** All entity mentions in text, non-overlapping, longest match preferred. */
export function findEntities(text: string, registry: EntityDef[] = ENTITY_REGISTRY): EntityMention[] {
  const cands: EntityMention[] = [];
  for (const e of registry) {
    for (const alias of e.aliases) {
      const re = new RegExp(`(?<![A-Za-z])${escape(alias)}(?![A-Za-z])`, "g");
      for (const m of text.matchAll(re)) cands.push({ slug: e.slug, name: e.name, alias, start: m.index!, end: m.index! + alias.length });
    }
  }
  for (const m of text.matchAll(NEW_ENTITY_RE)) {
    const name = m[1].replace(/\.$/, "");
    if (/^(The|This|Our|Master|Service|Signed|Executed)\b/.test(name)) continue;
    cands.push({ slug: `companies/${slugify(name)}`, name, alias: name, start: m.index!, end: m.index! + m[1].length });
  }
  cands.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const chosen: EntityMention[] = [];
  for (const c of cands) if (!chosen.some((x) => c.start < x.end && x.start < c.end)) chosen.push(c);
  // Registry entries beat pattern-derived names for the same span length.
  return chosen.sort((a, b) => a.start - b.start);
}

export function registryEntity(slug: string): EntityDef | undefined {
  return ENTITY_REGISTRY.find((e) => e.slug === slug);
}

/** Similar-but-distinct names (shared leading token), used by the skeptic to explain non-matches. */
export function similarEntities(slug: string, name: string): EntityDef[] {
  const first = name.split(/\s+/)[0]?.toLowerCase();
  return ENTITY_REGISTRY.filter((e) => e.slug !== slug && e.name.split(/\s+/)[0]?.toLowerCase() === first);
}
