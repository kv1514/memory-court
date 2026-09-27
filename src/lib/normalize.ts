// Deterministic normalization of values, units and dates.
import type { NormalizedValue } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

export interface DateHit { iso: string; start: number; end: number; raw: string }

const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

/** All dates in text: ISO (2026-01-01), "January 1, 2026", "1 January 2026". */
export function findDates(text: string): DateHit[] {
  const hits: DateHit[] = [];
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    hits.push({ iso: `${m[1]}-${m[2]}-${m[3]}`, start: m.index!, end: m.index! + m[0].length, raw: m[0] });
  }
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) {
    const mo = MONTHS[m[1].toLowerCase().replace(/\.$/, "")];
    if (mo) hits.push({ iso: `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}`, start: m.index!, end: m.index! + m[0].length, raw: m[0] });
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) hits.push({ iso: `${m[3]}-${pad(mo)}-${pad(Number(m[1]))}`, start: m.index!, end: m.index! + m[0].length, raw: m[0] });
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function parseDate(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return findDates(text)[0]?.iso;
}

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};

export function parseNumber(raw: string): number {
  const w = WORD_NUM[raw.toLowerCase()];
  if (w !== undefined) return w;
  return Number(raw.replace(/,/g, ""));
}

const fmtMoney = (amount: number, currency: string) => {
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
  return `${sym}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

export interface ValueHit { value: NormalizedValue; raw: string; start: number; end: number }

/** Money: "$48,000", "USD 4.5k", "48,000 USD", "€3,000", with an optional period ("per year", "/month", "annually"). */
export function findMoney(text: string): ValueHit[] {
  const out: ValueHit[] = [];
  const re = /(?:(USD|EUR|GBP)\s?|([$€£]))\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k|K|m|M|thousand|million)?\b(?:\s?(USD|EUR|GBP))?/g;
  for (const m of text.matchAll(re)) {
    const currency = m[1] ?? m[6] ?? (m[2] === "€" ? "EUR" : m[2] === "£" ? "GBP" : "USD");
    let amount = Number(`${m[3].replace(/,/g, "")}${m[4] ? "." + m[4] : ""}`);
    const mult = m[5]?.toLowerCase();
    if (mult === "k" || mult === "thousand") amount *= 1_000;
    if (mult === "m" || mult === "million") amount *= 1_000_000;
    const start = m.index!;
    let end = start + m[0].length;
    const tail = text.slice(end, end + 28);
    let period: NormalizedValue["period"] = "one_time";
    const pm = tail.match(/^\s*(?:\/\s*|per\s+|a\s+|each\s+)?(year|yr|annum|month|mo)\b|^\s*(annually|yearly|monthly)\b/i);
    if (pm) {
      const p = (pm[1] ?? pm[2]).toLowerCase();
      period = p.startsWith("mo") ? "month" : "year";
      end += pm[0].length;
    }
    out.push({
      value: { kind: "money", amount, currency, period, display: `${fmtMoney(amount, currency)}${period === "one_time" ? "" : ` / ${period}`}` },
      raw: text.slice(start, end),
      start,
      end,
    });
  }
  return out;
}

/** Durations → days. Handles "30 days", "two weeks", "Net 30". */
export function findDurations(text: string): ValueHit[] {
  const out: ValueHit[] = [];
  const num = "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|ninety)";
  for (const m of text.matchAll(new RegExp(`\\b${num}[\\s-](calendar\\s|business\\s)?(day|week|month|year)s?\\b`, "gi"))) {
    const n = parseNumber(m[1]);
    const unit = m[3].toLowerCase();
    const days = unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
    out.push({ value: { kind: "duration", amount: days, unit: "day", display: `${days} days` }, raw: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/\bnet[\s-]?(\d{1,3})\b/gi)) {
    const days = Number(m[1]);
    out.push({ value: { kind: "duration", amount: days, unit: "day", display: `${days} days (Net ${days})` }, raw: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function findPercents(text: string): ValueHit[] {
  return [...text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s?(%|percent\b)/gi)].map((m) => ({
    value: { kind: "percent" as const, amount: Number(m[1]), unit: "%", display: `${Number(m[1])}%` },
    raw: m[0],
    start: m.index!,
    end: m.index! + m[0].length,
  }));
}

const MASS: Record<string, number> = { kg: 1, kgs: 1, kilogram: 1, kilograms: 1, g: 0.001, grams: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, t: 1000, tonne: 1000, tonnes: 1000 };
const LENGTH: Record<string, number> = { km: 1000, kilometers: 1000, kilometres: 1000, mi: 1609.344, mile: 1609.344, miles: 1609.344, m: 1, meters: 1, metres: 1, ft: 0.3048, feet: 0.3048 };

export function findQuantities(text: string): ValueHit[] {
  const out: ValueHit[] = [];
  const re = /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(kg|kgs|kilograms?|grams|lbs?|pounds?|tonnes?|km|kilomet(?:er|re)s|mi|miles?|meters|metres|ft|feet|employees|people|staff|FTEs?|full-time employees)\b/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(`${m[1].replace(/,/g, "")}${m[2] ? "." + m[2] : ""}`);
    const u = m[3].toLowerCase();
    let value: NormalizedValue;
    if (u in MASS) {
      const kg = n * MASS[u];
      value = { kind: "quantity", amount: kg, unit: "kg", display: `${round(kg)} kg${u.startsWith("k") ? "" : ` (from ${n.toLocaleString("en-US")} ${u})`}` };
    } else if (u in LENGTH) {
      const meters = n * LENGTH[u];
      value = { kind: "quantity", amount: meters, unit: "m", display: `${round(meters / 1000)} km` };
    } else {
      value = { kind: "quantity", amount: n, unit: "people", display: `${n.toLocaleString("en-US")} people` };
    }
    out.push({ value, raw: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Converts money to a comparable annual/one-time basis for a predicate. */
export function toAnnual(v: NormalizedValue): NormalizedValue {
  if (v.kind !== "money" || v.period !== "month" || v.amount === undefined) return v;
  const amount = v.amount * 12;
  return { ...v, amount, period: "year", display: `${fmtMoney(amount, v.currency ?? "USD")} / year (from ${fmtMoney(v.amount, v.currency ?? "USD")} / month)` };
}

/**
 * Deterministic equality. Money, percentages and durations must match exactly (a 99.9% vs 99.5% SLA is a real
 * difference); only unit-converted physical quantities get a 0.5% tolerance for conversion rounding.
 */
export function valuesEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "text" || a.kind === "date") return (a.text ?? "").trim().toLowerCase() === (b.text ?? "").trim().toLowerCase();
  if (a.kind === "money" && (a.currency !== b.currency || (a.period ?? "one_time") !== (b.period ?? "one_time"))) return false;
  if (a.unit && b.unit && a.unit !== b.unit) return false;
  const x = a.amount ?? NaN;
  const y = b.amount ?? NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (a.kind === "money") return Math.abs(x - y) < 0.01;
  if (a.kind === "quantity") return x === y || Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)) <= 0.005;
  return Math.abs(x - y) < 1e-9;
}

/** Compact machine-readable form used inside GBrain fact text. */
export function valueToken(v: NormalizedValue): string {
  switch (v.kind) {
    case "money":
      return `${v.amount}${v.currency ?? "USD"}/${v.period ?? "one_time"}`;
    case "text":
    case "date":
      return (v.text ?? "").replace(/\s+/g, "_");
    default:
      return `${v.amount}${v.unit ?? ""}`;
  }
}

export function valueFromToken(token: string): NormalizedValue | undefined {
  const money = token.match(/^([\d.]+)(USD|EUR|GBP)\/(one_time|month|year)$/);
  if (money) {
    const amount = Number(money[1]);
    const currency = money[2];
    const period = money[3] as NormalizedValue["period"];
    return { kind: "money", amount, currency, period, display: `${fmtMoney(amount, currency)}${period === "one_time" ? "" : ` / ${period}`}` };
  }
  const q = token.match(/^([\d.]+)(kg|m|people|day|%)$/);
  if (q) {
    const amount = Number(q[1]);
    const unit = q[2];
    const kind = unit === "day" ? "duration" : unit === "%" ? "percent" : "quantity";
    const display = unit === "day" ? `${amount} days` : unit === "%" ? `${amount}%` : unit === "kg" ? `${round(amount)} kg` : unit === "m" ? `${round(amount / 1000)} km` : `${amount} people`;
    return { kind, amount, unit, display };
  }
  return token ? { kind: "text", text: token.replace(/_/g, " "), display: token.replace(/_/g, " ") } : undefined;
}
