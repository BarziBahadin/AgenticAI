import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Chat Portal", description: "Read-only chat portal" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-6xl mx-auto p-4 space-y-4">
          <div className="bg-white border rounded p-3 flex justify-between items-center">
            <div className="font-bold">Chat Portal (Read Only)</div>
            <Nav />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
