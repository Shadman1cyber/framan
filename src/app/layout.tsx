import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ToastProvider } from "@/components/ui/Toast";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { LedgerSyncBadge } from "@/components/offline/LedgerSyncBadge";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "کافه فرمان | منوی دیجیتال",
  description: "منوی دیجیتال کافه فرمان — سفارش آسان با QR، آگاهی از آلرژی، پیشنهادهای شخصی.",
  openGraph: {
    title: "کافه فرمان",
    description: "تجربه‌ی سفارش آرام و گرم از کافه فرمان",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : (theme || (prefersDark ? 'dark' : 'light'));
                  document.documentElement.classList.toggle('dark', resolved === 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <ToastProvider>
            <OfflineBanner />
            <LedgerSyncBadge />
            {children}
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}