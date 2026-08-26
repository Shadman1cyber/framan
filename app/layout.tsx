import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { DemoProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getUserById } from "@/lib/users-store";

export const metadata: Metadata = {
  title: "فرمان — مرکز فرماندهی",
  description: "لایه اجرایی هوشمند برای عملیات کسب‌وکار",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  const stored = userId ? await getUserById(userId) : null;
  const user = stored
    ? {
        id: stored.id,
        name: stored.name,
        title: stored.title,
        roleId: stored.roleId,
        approvalLimit: stored.approvalLimit,
      }
    : null;

  return (
    <html lang="fa" dir="rtl">
      <head>
        <link
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
          rel="stylesheet"
        />
      </head>
      <body>
        <DemoProvider initialUser={user}>
          <AppShell user={user}>{children}</AppShell>
        </DemoProvider>
      </body>
    </html>
  );
}
