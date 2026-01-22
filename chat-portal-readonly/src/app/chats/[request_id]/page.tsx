import { requireAdmin } from "@/lib/auth";
import { getChatMessages } from "@/lib/chatRepo";
import { ChatBubble } from "@/components/ChatBubble";
import { secondsToHMS } from "@/lib/timeFormat";
import { Key } from "react";


export default async function ChatDetail({
  params,
}: {
  params: Promise<{ request_id: string }>;
}) {
  requireAdmin();

  const { request_id } = await params;
  const data = await getChatMessages(request_id);

  const r = data.request;
  const m = data.metrics;

  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4 space-y-2">
        <h1 className="text-xl font-bold">Chat: {data.request_id}</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Customer Name</div>
            <div className="font-semibold">{r?.customer_name ?? "-"}</div>
          </div>

          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Request Created At</div>
            <div className="font-semibold">
              {r?.created_at ? new Date(r.created_at).toLocaleString() : "-"}
            </div>
          </div>

          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Request Status</div>
            <div className="font-semibold">{r?.status ?? "-"}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">FRT</div>
            <div className="font-semibold">
              {m.frt_seconds == null ? "-" : secondsToHMS(m.frt_seconds)}{" "}
              {m.breach_frt ? "⚠️" : "00:05:00"}
              <div className="text-xs text-gray-500">
                SLA: {m.frt_sla_seconds}s
              </div>
            </div>
          </div>
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Agent (Assigned)</div>
            <div className="font-semibold">
              {r?.assigned_agent_username ?? r?.assigned_agent_id ?? "-"}
            </div>
          </div>
          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Handled By</div>
            <div className="font-semibold">{r?.handled_by_display ?? "-"}</div>
          </div>

          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Resolution SLA</div>
            <div className="font-semibold">
              {m.resolution_seconds == null
                ? "-"
                : secondsToHMS(m.resolution_seconds)}{" "}
              {m.breach_resolution ? "⚠️" : ""}
              <div className="text-xs text-gray-500">
                SLA: {m.resolution_sla_seconds}s
              </div>
            </div>
          </div>

          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Issue</div>
            <div className="font-semibold">
              {r?.issue_category_name ?? "-"} / {r?.issue_name ?? "-"}
            </div>
          </div>

          <div className="p-2 rounded bg-gray-50 border">
            <div className="text-gray-600 text-xs">Message Count</div>
            <div className="font-semibold">{data.messages.length}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {data.messages.map((msg: { id: Key | null | undefined; account_type: string | null; agent_username: string | null; sent_at: string; message: string; }) => (
          <ChatBubble
            key={msg.id}
            accountType={msg.account_type}
            agentUsername={msg.agent_username}
            ts={msg.sent_at}
            text={msg.message}
          />
        ))}
      </div>
    </main>
  );
}
