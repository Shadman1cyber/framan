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

const vazirmatn = localFont({
  src: [
    { path: "./fonts/Vazirmatn-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Vazirmatn-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Vazirmatn-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Vazirmatn-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

const playfairDisplay = localFont({
  src: [
    { path: "./fonts/PlayfairDisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/PlayfairDisplay-Semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-playfair-latin",
  display: "swap",
});

const plusJakartaSans = localFont({
  src: [
    { path: "./fonts/PlusJakartaSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/PlusJakartaSans-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/PlusJakartaSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-jakarta-latin",
  display: "swap",
});

const notoNaskh = localFont({
  src: [
    { path: "./fonts/NotoNaskhArabic-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/NotoNaskhArabic-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-playfair-arabic",
  display: "swap",
});

const notoSansArabic = localFont({
  src: [
    { path: "./fonts/NotoSansArabic-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/NotoSansArabic-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-jakarta-arabic",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1e24",
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
    <html lang="fa" dir="rtl" className={`${peyda.variable} ${vazirmatn.variable} ${playfairDisplay.variable} ${plusJakartaSans.variable} ${notoNaskh.variable} ${notoSansArabic.variable} dark`} style={{ colorScheme: "dark" }}>
      <head>
        <meta name="theme-color" content="#1a1e24" />
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
      <body className="font-sans antialiased bg-cream text-espresso">
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
