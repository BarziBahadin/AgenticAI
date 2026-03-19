"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type JobStatus = "idle" | "queued" | "running" | "completed" | "stopped" | "failed";

interface JobState {
  job_id: string;
  status: JobStatus;
  provider: string;
  model: string;
  processed: number;
  success: number;
  failed: number;
  total_estimate: number | null;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
  files?: { xlsx?: string };
}

interface AuditResult {
  request_id: number;
  audited_at: string;
  model: string;
  ok: boolean;
  error?: string;
  audit?: {
    summary?: string;
    scores?: { total?: number; compliance?: number; quality?: number; resolution?: number; sla?: number };
    risk_level?: string;
    sentiment?: string;
    category?: string;
  };
}

const RISK_COLOR: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "text-green-600",
  neutral: "text-gray-500",
  negative: "text-red-600",
};

function ScoreBadge({ value }: { value?: number }) {
  if (value == null) return <span className="text-gray-400">—</span>;
  const color = value >= 75 ? "text-green-600" : value >= 50 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-bold ${color}`}>{value}</span>;
}

export default function AuditPage() {
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [results, setResults] = useState<AuditResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`${API}/api/v1/audit/status?job_id=${jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setJobState(data.state);
      if (data.tail?.length) setResults(data.tail.slice().reverse());
      if (["completed", "stopped", "failed"].includes(data.state.status)) {
        stopPolling();
      }
    } catch {
      // network hiccup — keep polling
    }
  }, [stopPolling]);

  const startJob = async () => {
    setError(null);
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`${API}/api/v1/audit/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start job");
      setJobState({ ...data, status: "queued", processed: 0, success: 0, failed: 0, total_estimate: null, last_error: null, created_at: new Date().toISOString(), finished_at: null });
      pollRef.current = setInterval(() => pollStatus(data.job_id), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const stopJob = async () => {
    if (!jobState?.job_id) return;
    await fetch(`${API}/api/v1/audit/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobState.job_id }),
    });
    stopPolling();
    await pollStatus(jobState.job_id);
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const isRunning = jobState?.status === "running" || jobState?.status === "queued";
  const isDone = jobState?.status === "completed" || jobState?.status === "stopped";
  const progress = jobState?.total_estimate
    ? Math.round(((jobState.processed) / jobState.total_estimate) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">قياس — مراجعة جودة AI</h1>
        <p className="text-gray-500 mt-1">تقييم محادثات مركز الاتصال باستخدام الذكاء الاصطناعي</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={startJob}
            disabled={loading || isRunning}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "جاري التشغيل..." : "بدء المراجعة"}
          </button>

          {isRunning && (
            <button
              onClick={stopJob}
              className="px-6 py-2.5 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors"
            >
              إيقاف
            </button>
          )}

          {isDone && jobState?.files?.xlsx && (
            <a
              href={`${API}/api/v1/audit/download?job_id=${jobState.job_id}`}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              تحميل Excel
            </a>
          )}

          {jobState && (
            <div className="mr-auto text-sm text-gray-500">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                jobState.status === "completed" ? "bg-green-100 text-green-700" :
                jobState.status === "running" ? "bg-blue-100 text-blue-700" :
                jobState.status === "failed" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                {jobState.status === "queued" ? "في الانتظار" :
                 jobState.status === "running" ? "يعمل" :
                 jobState.status === "completed" ? "مكتمل" :
                 jobState.status === "stopped" ? "موقوف" : "فشل"}
              </span>
              <span className="mr-3">النموذج: <strong>{jobState.model}</strong></span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Progress bar */}
        {jobState && jobState.total_estimate != null && (
          <div className="mt-5">
            <div className="flex justify-between text-sm text-gray-500 mb-1.5">
              <span>{jobState.processed} / {jobState.total_estimate} محادثة</span>
              <span>
                <span className="text-green-600 font-medium">{jobState.success} ناجح</span>
                {jobState.failed > 0 && <span className="text-red-500 mr-2">{jobState.failed} فشل</span>}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {jobState?.last_error && (
          <p className="mt-3 text-xs text-red-500">آخر خطأ: {jobState.last_error}</p>
        )}
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">آخر النتائج</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-right">رقم الطلب</th>
                  <th className="px-4 py-3 text-center">المجموع</th>
                  <th className="px-4 py-3 text-center">الامتثال</th>
                  <th className="px-4 py-3 text-center">الجودة</th>
                  <th className="px-4 py-3 text-center">الحل</th>
                  <th className="px-4 py-3 text-center">SLA</th>
                  <th className="px-4 py-3 text-center">المخاطر</th>
                  <th className="px-4 py-3 text-center">المشاعر</th>
                  <th className="px-4 py-3 text-right">الملخص</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.request_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{r.request_id}</td>
                    {r.ok && r.audit ? (
                      <>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={r.audit.scores?.total} /></td>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={r.audit.scores?.compliance} /></td>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={r.audit.scores?.quality} /></td>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={r.audit.scores?.resolution} /></td>
                        <td className="px-4 py-3 text-center"><ScoreBadge value={r.audit.scores?.sla} /></td>
                        <td className="px-4 py-3 text-center">
                          {r.audit.risk_level && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLOR[r.audit.risk_level] || "bg-gray-100 text-gray-600"}`}>
                              {r.audit.risk_level}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-center text-xs ${SENTIMENT_COLOR[r.audit.sentiment || ""] || ""}`}>
                          {r.audit.sentiment || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{r.audit.summary || "—"}</td>
                      </>
                    ) : (
                      <td colSpan={8} className="px-4 py-3 text-red-500 text-xs">{r.error || "فشل"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!jobState && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">اضغط "بدء المراجعة" لبدء تقييم المحادثات</p>
        </div>
      )}
    </div>
  );
}
