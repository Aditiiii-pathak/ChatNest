import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ChatNest — AI Conversations",
  description:
    "ChatGPT-style AI chat with semantic memory, powered by Google Gemini.",
  applicationName: "ChatNest",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChatNest",
  },
  formatDetection: {
    telephone: false,
  },
};

/* Mobile viewport — ``viewportFit: "cover"`` lets us use
   ``env(safe-area-inset-*)`` to avoid the iOS home indicator
   and notch eating UI. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} font-sans bg-zinc-950 text-zinc-100 antialiased overscroll-none`}
      >
        {children}
      </body>
    </html>
  );
}
