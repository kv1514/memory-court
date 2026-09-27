// Prompt-injection screening. Documents and retrieved memories are DATA: nothing inside them can grant
// authority, change instructions, or authorize memory writes. Writes only happen through code paths in
// engine/pipeline.ts (auto-commit policy) and engine/review.ts (human decision), never on document request.
import type { InjectionScan } from "./types";

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "override-instructions", re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|system|existing)\s+(instructions?|prompts?|rules|guidelines|directions)/gi },
  { name: "role-hijack", re: /\b(you are now|act as (an? |the )?(admin|administrator|system|developer|root)|developer mode|jailbreak)\b/gi },
  { name: "system-prompt-reference", re: /\b(system|developer)\s+(prompt|message|instructions?)\b|<\/?(system|assistant|instructions?)>|\bBEGIN (SYSTEM|ADMIN|INSTRUCTIONS)\b/gi },
  { name: "new-instructions", re: /\b(new|updated|revised)\s+instructions?\s*:/gi },
  { name: "bulk-memory-mutation", re: /\b(change|set|update|overwrite|replace|reset)\s+(all|every|each)\b[^.]{0,50}\b(prices?|values?|memor(?:y|ies)|facts?|records?|fees?|windows?)\b/gi },
  { name: "memory-deletion", re: /\b(delete|erase|wipe|purge|forget)\s+(all|every|the|any)\b[^.]{0,40}\b(memor(?:y|ies)|facts?|records?|data|history)\b/gi },
  { name: "verification-bypass", re: /\b(mark|treat|record|store)\s+(this|these|it|them|all)\b[^.]{0,40}\bas\s+(verified|trusted|approved|true|authoritative)\b|\bdo not\s+(flag|verify|review|check|report|audit)\b|\bskip\s+(verification|review)\b/gi },
];

export function scanForInjection(text: string): InjectionScan {
  const matches: InjectionScan["matches"] = [];
  for (const { name, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      matches.push({ pattern: name, excerpt: text.slice(Math.max(0, start - 20), Math.min(text.length, end + 40)).trim(), start, end });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  const kinds = new Set(matches.map((m) => m.pattern)).size;
  return { flagged: matches.length > 0, score: Math.min(1, matches.length * 0.35 + kinds * 0.15), matches };
}

/** True when [start,end) overlaps any injection match — such spans are never extracted as facts. */
export function overlapsInjection(scan: InjectionScan, start: number, end: number): boolean {
  return scan.matches.some((m) => start < m.end && m.start < end);
}

/** Wraps untrusted text for LLM prompts: the model is told it is data and must not follow it. */
export function fenceUntrusted(label: string, text: string): string {
  const safe = text.replace(/<\/?untrusted[^>]*>/gi, "");
  return `<untrusted source="${label}">\n${safe}\n</untrusted>`;
}
