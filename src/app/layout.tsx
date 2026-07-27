import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Move Hub Commissions",
  description: "The Move Hub — staff commission tracker",
  icons: { icon: "/logo-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#080C18",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
