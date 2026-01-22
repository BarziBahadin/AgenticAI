"use client";

import { useEffect, useMemo, useState } from "react";

type TailRow = any;

type State = {
  job_id: string;
  status: string;
  model: string;
  processed: number;
  success: number;
  failed: number;
  total_estimate?: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  last_error?: string;
};

export default function AuditClient() {
  const [jobId, setJobId] = useState<string>("");
  const [state, setState] = useState<State | null>(null);
  const [tail, setTail] = useState<TailRow[]>([]);
  const [busy, setBusy] = useState(false);

  const canDownload = state?.status === "completed";

  const downloadUrl = useMemo(() => {
    if (!jobId) return "#";
    return `/api/audit/download?job_id=${encodeURIComponent(jobId)}`;
  }, [jobId]);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/audit/run", { method: "POST" });
      const json = await res.json();
      setJobId(json.job_id);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!jobId) return;
    await fetch("/api/audit/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });
  }

  useEffect(() => {
    if (!jobId) return;

    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/audit/status?job_id=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setState(json.state);
        setTail(Array.isArray(json.tail) ? json.tail : []);
      } catch {}
    };

    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [jobId]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={start}
          disabled={busy}
        >
          Start AI Audit (30k)
        </button>

        <button
          className="px-3 py-2 rounded border"
          onClick={stop}
          disabled={!jobId || state?.status !== "running"}
        >
          Stop
        </button>

        {canDownload && (
          <a className="px-3 py-2 rounded border underline" href={downloadUrl}>
            Download Excel
          </a>
        )}
      </div>

      {jobId && (
        <div className="border rounded p-3 bg-white space-y-1">
          <div className="text-sm text-gray-600">job_id: <span className="font-mono">{jobId}</span></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div><span className="text-gray-600">status:</span> {state?.status ?? "-"}</div>
            <div><span className="text-gray-600">model:</span> {state?.model ?? "-"}</div>
            <div><span className="text-gray-600">processed:</span> {state?.processed ?? 0}</div>
            <div><span className="text-gray-600">success:</span> {state?.success ?? 0}</div>
            <div><span className="text-gray-600">failed:</span> {state?.failed ?? 0}</div>
            <div><span className="text-gray-600">estimate:</span> {state?.total_estimate ?? "-"}</div>
          </div>

          {state?.last_error && (
            <div className="text-sm text-red-600 mt-2">last_error: {state.last_error}</div>
          )}
        </div>
      )}

      <div className="border rounded bg-white overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-right">
              <th className="p-2">request_id</th>
              <th className="p-2">ok</th>
              <th className="p-2">score</th>
              <th className="p-2">risk</th>
              <th className="p-2">category</th>
              <th className="p-2">summary</th>
              <th className="p-2">error</th>
            </tr>
          </thead>
          <tbody>
            {tail.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono">{r.request_id ?? "-"}</td>
                <td className="p-2">{r.ok ? "true" : "false"}</td>
                <td className="p-2">{r.audit?.scores?.total ?? "-"}</td>
                <td className="p-2">{r.audit?.risk_level ?? "-"}</td>
                <td className="p-2">{r.audit?.category ?? "-"}</td>
                <td className="p-2">{r.audit?.summary ?? "-"}</td>
                <td className="p-2 text-red-600">{r.error ?? ""}</td>
              </tr>
            ))}
            {tail.length === 0 && (
              <tr><td className="p-3 text-gray-600" colSpan={7}>No results yet…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
