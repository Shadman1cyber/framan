import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { ToastProvider } from "@/components/ui/Toast";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { LedgerSyncBadge } from "@/components/offline/LedgerSyncBadge";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";

const peyda = localFont({
  src: [
    { path: "./fonts/Peyda-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Peyda-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Peyda-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Peyda-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-peyda",
  display: "swap",
  fallback: ["system-ui", "Arial"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1A1612",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "کافه ۱۳ | منوی دیجیتال",
  description: "منوی دیجیتال کافه ۱۳ — سفارش آسان با QR، آگاهی از آلرژی، پیشنهادهای شخصی.",
  openGraph: {
    title: "کافه ۱۳",
    description: "تجربه‌ی سفارش آرام و گرم از کافه ۱۳",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={`${peyda.variable} dark`} style={{ colorScheme: "dark" }}>
      <head>
        <meta name="theme-color" content="#1A1612" />
        <meta name="color-scheme" content="dark" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.classList.add('dark');
                  localStorage.removeItem('theme');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased bg-[#1A1612] text-[#F5EFE6]">
        <Providers>
          <ToastProvider>
            <OfflineBanner />
            <LedgerSyncBadge />
            <AppUpdateNotice />
            {children}
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
