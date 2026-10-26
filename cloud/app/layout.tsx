import type { Metadata, Viewport } from "next";
import "./globals.css";
import { InAppBanner } from "@/components/in-app-banner";

export const metadata: Metadata = {
  title: "Orbit",
  description: "내 위성들이 일하는 곳",
  applicationName: "Orbit",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Orbit" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {/* iOS Safari only shows :active press states once a touch listener exists. */}
        <script dangerouslySetInnerHTML={{ __html: "document.addEventListener('touchstart',function(){},{passive:true})" }} />
        {children}
        <InAppBanner />
      </body>
    </html>
  );
}
