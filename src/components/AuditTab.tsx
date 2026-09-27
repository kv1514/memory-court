"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { AuditResponse } from "@/lib/types";
import { apiGet, errMsg } from "./api";
import { fmtDateTime, safeJson, shortHash } from "./format";
import { actorTone } from "./labels";
import { Badge, Button, Empty, ErrorBox, Icon, Loading, Panel, PanelHeader, cx } from "./ui";

const POLL_MS = 6000;

export function AuditTab({ refreshKey, active }: { refreshKey: number; active: boolean }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      setData(await apiGet<AuditResponse>("/api/audit?limit=200"));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active, refreshKey, load]);

  const events = data?.events ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel>
        <PanelHeader
          title="Audit log"
          subtitle="Append-only and hash-chained: each event's hash covers the previous hash, so any edit breaks the chain."
          right={
            <>
              {data &&
                (data.chainValid ? (
                  <Badge tone="emerald">hash chain verified ✓</Badge>
                ) : (
                  <Badge tone="red">chain broken</Badge>
                ))}
              <Button size="sm" variant="ghost" onClick={() => void load()} loading={loading}>
                <Icon name="refresh" /> Refresh
              </Button>
            </>
          }
        />
        {err && (
          <div className="p-4">
            <ErrorBox title="Could not load the audit log" message={err} />
          </div>
        )}
        {!data && !err && (
          <div className="p-4">
            <Loading label="Loading audit events…" />
          </div>
        )}
        {data && !data.chainValid && (
          <div role="alert" className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">
            Hash chain verification failed — at least one audit event was modified or removed after it was written.
          </div>
        )}
        {data && events.length === 0 && (
          <div className="p-4">
            <Empty title="No audit events yet" hint="Submitting a document, deciding a review or resetting the demo writes events here." />
          </div>
        )}
        {events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-zinc-800 text-[10.5px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="w-14 px-4 py-2 font-medium">Seq</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Summary</th>
                  <th className="px-4 py-2 text-right font-medium">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {events.map((e) => {
                  const isOpen = open === e.seq;
                  const refs = Object.entries(e.refs ?? {}).filter(([, v]) => v);
                  return (
                    <Fragment key={e.seq}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : e.seq)}
                        className={cx("cursor-pointer align-top transition-colors duration-150 hover:bg-zinc-800/30", isOpen && "bg-zinc-800/30")}
                      >
                        <td className="px-4 py-2 font-mono tabular-nums text-zinc-500">{e.seq}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-zinc-400">{fmtDateTime(e.at)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={actorTone(e.actor)}>{e.actor}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-zinc-300">{e.type}</td>
                        <td className="px-3 py-2 text-zinc-300">{e.summary}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-500" title={e.hash}>
                          {shortHash(e.hash)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-zinc-950/50">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 font-mono text-[11px]">
                                <div>
                                  <span className="text-zinc-500">hash </span>
                                  <span className="break-all text-zinc-300">{e.hash}</span>
                                </div>
                                <div>
                                  <span className="text-zinc-500">prev </span>
                                  <span className="break-all text-zinc-400">{e.prevHash}</span>
                                </div>
                                {refs.map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-zinc-500">{k} </span>
                                    <span className="text-zinc-300">{v}</span>
                                  </div>
                                ))}
                              </div>
                              {e.data !== undefined && e.data !== null && (
                                <pre className="max-h-64 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10.5px] leading-relaxed text-zinc-400">
                                  {safeJson(e.data, 2)}
                                </pre>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
              Showing {events.length} of {data?.total ?? events.length} events · newest first · click a row for hashes, refs and payload
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
