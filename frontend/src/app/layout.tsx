import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qiyas — AI Audit",
  description: "AI-powered QA scoring for contact center conversations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-gray-50 text-gray-900 font-sans">{children}</body>
    </html>
  );
}
