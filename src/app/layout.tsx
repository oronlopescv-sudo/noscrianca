import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import { RegisterSW } from "@/components/pwa";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "NosCriança", template: "%s · NosCriança" },
  description: "Plataforma de gestão de creches e jardins de infância.",
  openGraph: {
    type: "website",
    siteName: "NosCriança",
    title: "NosCriança",
    description: "Plataforma de gestão de creches e jardins de infância.",
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NosCriança", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1B2333", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
