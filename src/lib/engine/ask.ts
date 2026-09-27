// "Ask the agent": answers ONLY from what GBrain returns (recall), never from Memory Court's local store.
import type { AskResponse, MemoryFact } from "../types";
import { findEntities, registryEntity } from "../entities";
import { PREDICATES } from "../extract/rules";
import * as gb from "../gbrain/client";
import { displayFactText, toMemoryFact } from "./facts";

const PRED_HINTS: [RegExp, string[]][] = [
  [/refund|return/i, ["policy.refund_window"]],
  [/payment terms|\bnet\b|pay within|days to pay/i, ["contract.payment_terms"]],
  [/uptime|\bsla\b|availability/i, ["contract.sla_uptime"]],
  [/headcount|employees|staff|how many people/i, ["org.headcount"]],
  [/payload|capacity|lift|carry/i, ["product.payload_capacity"]],
  [/per seat|seat price/i, ["pricing.per_seat"]],
  [/annual|per year|yearly|contract value|annual fee/i, ["contract.annual_value", "contract.total_value"]],
  [/pay|price|cost|fee|agree|quote|value|deal|charge/i, ["contract.total_value", "contract.annual_value"]],
];

const BINDING = ["signed", "amendment", "policy", "record"];

export async function ask(question: string): Promise<AskResponse> {
  const reasoning: string[] = [];
  const mention = findEntities(question)[0];
  const predIds = PRED_HINTS.find(([re]) => re.test(question))?.[1] ?? [];
  if (!mention) {
    return { question, answer: "I couldn't identify which company this is about. Try naming it (e.g. \"Northwind Logistics\").", history: [], retrieval: { tool: "recall", args: {}, factCount: 0, at: new Date().toISOString(), ms: 0 }, reasoning: ["No known entity in the question."] };
  }
  const name = registryEntity(mention.slug)?.name ?? mention.name;
  reasoning.push(`Resolved entity "${mention.alias}" → ${mention.slug}.`);
  if (predIds.length) reasoning.push(`Resolved attribute → ${predIds.map((p) => PREDICATES[p].label).join(" / ")}.`);
  const args = { entity: mention.slug, include_expired: true, limit: 100 };
  const t0 = Date.now();
  const res = await gb.recall(args);
  const ms = Date.now() - t0;
  const facts = res.facts.map(toMemoryFact).filter((f) => f.entitySlug === mention.slug);
  reasoning.push(`Called GBrain recall(entity="${mention.slug}", include_expired=true) → ${facts.length} fact(s) in ${ms} ms.`);
  const matching = facts.filter((f) => (predIds.length ? predIds.includes(f.mc?.predicate ?? "") : true));
  const active = matching.filter((f) => !f.expiredAt);
  const expired = matching.filter((f) => f.expiredAt);
  reasoning.push(`${matching.length} fact(s) match the attribute: ${active.length} active, ${expired.length} expired in GBrain.`);
  const wantsBinding = /agree|signed|contract|pay|owe|current/i.test(question);
  const rank = (f: MemoryFact) => [
    wantsBinding && BINDING.includes(f.mc?.stage ?? "") ? 1 : 0,
    f.mc?.effective ?? "",
    f.validFrom ?? "",
  ];
  const sorted = [...active].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? -1 : 1;
    return 0;
  });
  const current = sorted[0];
  const retrieval = { tool: "recall" as const, args, factCount: facts.length, at: new Date().toISOString(), ms };
  if (!current) {
    return { question, entity: { slug: mention.slug, name }, predicate: predIds[0] ? { id: predIds[0], label: PREDICATES[predIds[0]].label } : undefined, answer: `GBrain has no active memory about ${name}${predIds.length ? `'s ${PREDICATES[predIds[0]].label}` : ""}.`, history: expired, retrieval, reasoning };
  }
  if (sorted.length > 1) reasoning.push(`Chose fact #${current.factId}: ${wantsBinding ? "binding stage preferred, then " : ""}latest effective date (${current.mc?.effective ?? current.validFrom?.slice(0, 10)}).`);
  for (const f of expired) reasoning.push(`Fact #${f.factId} was expired in GBrain at ${f.expiredAt} and is shown only as history.`);
  const history = matching.filter((f) => f.factId !== current.factId);
  const text = displayFactText(current.text);
  return {
    question,
    entity: { slug: mention.slug, name },
    predicate: current.mc?.predicate ? { id: current.mc.predicate, label: PREDICATES[current.mc.predicate]?.label ?? current.mc.predicate } : undefined,
    answer: `${text} — per GBrain fact #${current.factId}.`,
    current,
    history,
    retrieval,
    reasoning,
  };
}
