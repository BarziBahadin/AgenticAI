import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listChats } from "@/lib/chatRepo";
import { secondsToHMS } from "@/lib/timeFormat";

function pct(n: number, d: number) {
  if (d <= 0) return "0%";
  const p = (n / d) * 100;
  return `${p.toFixed(1)}%`;
}

export default async function ChatsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  requireAdmin();
  const sp = await searchParams;

  const page = Number((sp.page as string) ?? 1);
  const pageSize = Number((sp.pageSize as string) ?? 50);

  // existing
  const from = sp.from ? String(sp.from) : undefined;
  const to = sp.to ? String(sp.to) : undefined;
  const q = sp.q ? String(sp.q) : undefined;

  // NEW filters
  const status = sp.status ? String(sp.status) : undefined;
  const category = sp.category ? String(sp.category) : undefined;
  const app_name = sp.app_name ? String(sp.app_name) : undefined;
  const company_name = sp.company_name ? String(sp.company_name) : undefined;
  const language = sp.language ? String(sp.language) : undefined;
  const assigned_agent_id = sp.assigned_agent_id ? String(sp.assigned_agent_id) : undefined;

  const data = await listChats({
    from, to, q,
    status, category, app_name, company_name, language, assigned_agent_id,
    page, pageSize
  });

  const k = data.kpis;

  const qsBase: Record<string, string> = {};
  if (q) qsBase.q = q;
  if (from) qsBase.from = from;
  if (to) qsBase.to = to;
  if (status) qsBase.status = status;
  if (category) qsBase.category = category;
  if (app_name) qsBase.app_name = app_name;
  if (company_name) qsBase.company_name = company_name;
  if (language) qsBase.language = language;
  if (assigned_agent_id) qsBase.assigned_agent_id = assigned_agent_id;
  qsBase.pageSize = String(pageSize);

  const prevHref = `/chats?${new URLSearchParams({ ...qsBase, page: String(Math.max(1, data.page - 1)) }).toString()}`;
  const nextHref = `/chats?${new URLSearchParams({ ...qsBase, page: String(data.page + 1) }).toString()}`;

  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4 space-y-4">
        <h1 className="text-xl font-bold">Chats</h1>

        {/* FILTERS */}
        <form className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input className="border rounded px-2 py-2" name="q" defaultValue={q ?? ""} placeholder="Search request_id" />
          <input className="border rounded px-2 py-2" name="from" defaultValue={from ?? ""} placeholder="from ISO" />
          <input className="border rounded px-2 py-2" name="to" defaultValue={to ?? ""} placeholder="to ISO" />

          <input className="border rounded px-2 py-2" name="status" defaultValue={status ?? ""} placeholder="status" />
          <input className="border rounded px-2 py-2" name="category" defaultValue={category ?? ""} placeholder="category" />
          <input className="border rounded px-2 py-2" name="language" defaultValue={language ?? ""} placeholder="language (ar/en)" />

          <input className="border rounded px-2 py-2" name="app_name" defaultValue={app_name ?? ""} placeholder="app_name" />
          <input className="border rounded px-2 py-2" name="company_name" defaultValue={company_name ?? ""} placeholder="company_name" />
          <input className="border rounded px-2 py-2" name="assigned_agent_id" defaultValue={assigned_agent_id ?? ""} placeholder="assigned_agent_id" />

          <input className="border rounded px-2 py-2" name="pageSize" defaultValue={String(pageSize)} placeholder="pageSize" />
          <button className="rounded bg-black text-white px-3 py-2" type="submit">Apply Filters</button>
        </form>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="border rounded bg-gray-50 p-3">
            <div className="text-xs text-gray-600">Total Requests (filtered)</div>
            <div className="text-lg font-bold">{k.total_requests}</div>
          </div>

          <div className="border rounded bg-gray-50 p-3">
            <div className="text-xs text-gray-600">FRT Breached (SLA)</div>
            <div className="text-lg font-bold">{pct(k.frt_breached, k.total_requests)}</div>
            <div className="text-xs text-gray-500">{k.frt_breached} breached • {k.frt_missing} missing</div>
          </div>

          <div className="border rounded bg-gray-50 p-3">
            <div className="text-xs text-gray-600">Avg FRT</div>
            <div className="text-lg font-bold">
              {k.avg_frt_seconds == null ? "-" : secondsToHMS(k.avg_frt_seconds)}
            </div>
          </div>

          <div className="border rounded bg-gray-50 p-3">
            <div className="text-xs text-gray-600">Resolution Breached (SLA)</div>
            <div className="text-lg font-bold">{pct(k.resolution_breached, k.total_requests)}</div>
            <div className="text-xs text-gray-500">{k.resolution_breached} breached • {k.resolution_missing} missing</div>
          </div>

          <div className="border rounded bg-gray-50 p-3">
            <div className="text-xs text-gray-600">Avg Resolution Time</div>
            <div className="text-lg font-bold">
              {k.avg_resolution_seconds == null ? "-" : secondsToHMS(k.avg_resolution_seconds)}
            </div>
          </div>
        </div>

        {/* LIST META */}
        <div className="text-sm text-gray-600">
          Total: {data.total} — Page {data.page}
        </div>

        {/* TABLE */}
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm bg-white">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-2">request_id</th>
                <th className="p-2">Customer Name</th>
                <th className="p-2">Request Date</th>
                <th className="p-2">FRT</th>
                <th className="p-2">Resolution</th>
                <th className="p-2">status</th>
                <th className="p-2">Agent (Assigned)</th>
                <th className="p-2">Handled By</th>
                <th className="p-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => {
                // ⚠️ if FRT > 5 minutes
                const warnFRT = c.frt_seconds != null && c.frt_seconds > 300;

                const frt = c.frt_seconds == null
                  ? "-"
                  : `${secondsToHMS(c.frt_seconds)}${warnFRT ? " ⚠️" : ""}`;

                const res = c.resolution_seconds == null
                  ? "-"
                  : secondsToHMS(c.resolution_seconds);

                return (
                  <tr key={c.request_id} className="border-t">
                    <td className="p-2">{c.request_id}</td>
                    <td className="p-2">{c.customer_name ?? "-"}</td>
                    <td className="p-2 whitespace-nowrap">
                      {c.request_created_at ? new Date(c.request_created_at).toLocaleString() : "-"}
                    </td>
                    <td className="p-2">{frt}</td>
                    <td className="p-2">{res}</td>
                    <td className="p-2">{c.request_status ?? "-"}</td>
                    <td className="p-2">{c.assigned_agent_username ?? c.assigned_agent_id ?? "-"}</td>
                    <td className="p-2">{c.handled_by_display ?? "-"}</td>
                    <td className="p-2">
                      <Link className="underline" href={`/chats/${c.request_id}`}>View</Link>
                    </td>
                  </tr>
                );
              })}

              {data.items.length === 0 && (
                <tr><td className="p-3 text-gray-600" colSpan={9}>No results</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="flex justify-between items-center">
          <Link
            className={`px-3 py-2 rounded border ${data.page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            href={prevHref}
          >
            Previous
          </Link>

          <Link
            className={`px-3 py-2 rounded border ${(data.page * data.pageSize) >= data.total ? "pointer-events-none opacity-50" : ""}`}
            href={nextHref}
          >
            Next
          </Link>
        </div>
      </div>
    </main>
  );
}
