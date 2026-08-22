import type { Metadata } from "next";
import "./globals.css";
import { DemoProvider } from "@/lib/store";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Farman — Command center",
  description: "AI-native execution layer for business operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DemoProvider>
          <Nav />
          <main className="md:pl-60">
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">{children}</div>
          </main>
        </DemoProvider>
      </body>
    </html>
  );
}
