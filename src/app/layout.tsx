import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FARMAN — AI Business Execution",
  description:
    "FARMAN (فرمان) is an AI-native business execution platform. We don't replace your business software — we make it act.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
