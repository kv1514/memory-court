// Formatting helpers. All dates are rendered client-side only (data is fetched after mount).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = parse(s);
  if (!d) return s;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtTime(s?: string | null): string {
  if (!s) return "—";
  const d = parse(s);
  if (!d) return s;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = parse(s);
  if (!d) return s;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function relTime(s: string | null | undefined, now: number): string {
  if (!s) return "—";
  const d = parse(s);
  if (!d || !now) return fmtTime(s);
  const sec = Math.round((now - d.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return fmtDate(s);
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  return String(n);
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export function shortHash(h?: string | null, n = 8): string {
  if (!h) return "—";
  return h.length > n ? `${h.slice(0, n)}…` : h;
}

export function factRef(id?: string | number | null): string {
  if (id === null || id === undefined || id === "") return "—";
  const s = String(id);
  return s.startsWith("#") ? s : `#${s}`;
}

export function humanize(s: string): string {
  return s.replace(/_/g, " ");
}

export function clamp01(n: number | null | undefined): number {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Facts written by Memory Court embed a machine tag; hide it in the reading view (full text stays in the title attribute). */
export function stripMcTag(text: string): string {
  if (!text) return text;
  const cleaned = text
    .replace(/\s*[\[{⟦<]\s*(?:mc|memory[-_ ]?court)\b[^\]}⟧>]*[\]}⟧>]\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || text;
}

export function safeJson(v: unknown, space?: number): string {
  try {
    const s = JSON.stringify(v, null, space);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}

/** Best-effort extraction of the id GBrain returned for a write (fact id, page slug, entry id…). */
export function resultId(r: unknown, depth = 0): string | null {
  if (r === null || r === undefined || depth > 3) return null;
  if (typeof r === "string") return r.length <= 64 ? r : null;
  if (typeof r === "number") return String(r);
  if (typeof r === "object" && !Array.isArray(r)) {
    const o = r as Record<string, unknown>;
    for (const k of ["factId", "fact_id", "id", "slug", "pageId", "page_id", "entryId", "entry_id"]) {
      const v = o[k];
      if (typeof v === "string" || typeof v === "number") return String(v);
    }
    for (const k of ["fact", "page", "entry", "result", "data"]) {
      const inner = resultId(o[k], depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}
