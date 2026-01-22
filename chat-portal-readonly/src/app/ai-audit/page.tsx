import AuditClient from "./AuditClient";
import { requireAdmin } from "@/lib/auth";

export default async function AiAuditPage() {
  requireAdmin();

  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4 space-y-3">
        <h1 className="text-xl font-bold">AI Audit Runner (GroqCloud)</h1>
        <p className="text-sm text-gray-600">
          Runs Groq audits for up to 30,000 chats and exports results to Excel.
        </p>
        <AuditClient />
      </div>
    </main>
  );
}
