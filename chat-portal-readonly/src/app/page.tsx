import Link from "next/link";

export default function Home() {
  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4">
        <h1 className="text-2xl font-bold">Chat Portal</h1>
        <p className="text-gray-700 mt-2">
          View and read chats from the database (read-only, no saving or editing).
        </p>
        <div className="flex gap-3 mt-4">
          <Link className="inline-block px-4 py-2 rounded bg-black text-white" href="/chats">
            Open Chat List
          </Link>
          <Link className="inline-block px-4 py-2 rounded bg-black text-white" href="/ai-audit">
            AI Audit
          </Link>
        </div>
      </div>
    </main>
  );
}
