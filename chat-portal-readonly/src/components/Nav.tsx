import Link from "next/link";

export function Nav() {
  return (
    <div className="flex gap-2 items-center">
      <Link 
        className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition-colors duration-200 no-underline" 
        href="/"
      >
        Home
      </Link>
      <Link 
        className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition-colors duration-200 no-underline" 
        href="/chats"
      >
        Chats
      </Link>
      <Link 
        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-200 no-underline" 
        href="/ai-audit"
      >
        AI Audit
      </Link>
    </div>
  );
}
