import type { Viewport } from "next";
import localFont from "next/font/local";
import { Caveat, Geist, Geist_Mono, Gochi_Hand } from "next/font/google";
import { rootMetadata } from "@/lib/metadata";
import { CookieConsent } from "@/components/cookie-consent";
import "@/ds/styles/base.css";
import "@/ds/styles/warm.css";
import "@/ds/styles/support.css";

const zodiak = localFont({ src: "../fonts/Zodiak-Regular.woff2", weight: "400", variable: "--font-zodiak", display: "swap", preload: false });
const switzer = localFont({
  src: [
    { path: "../fonts/Switzer-Regular.woff2", weight: "400" },
    { path: "../fonts/Switzer-Medium.woff2", weight: "500" },
    { path: "../fonts/Switzer-Semibold.woff2", weight: "600" },
  ],
  variable: "--font-switzer",
  display: "swap",
  preload: false,
});
const kid = Gochi_Hand({ weight: "400", subsets: ["latin"], variable: "--font-kid", display: "swap", preload: false });
const pen = Caveat({ weight: "600", subsets: ["latin"], variable: "--font-pen", display: "swap", preload: false });

// Warm look (D-034).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });

export const metadata = rootMetadata;

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" suppressHydrationWarning className={`${zodiak.variable} ${switzer.variable} ${kid.variable} ${pen.variable} ${geist.variable} ${geistMono.variable}`}>
      <head>
        {/* Reveal animations only hide content once JavaScript is running. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body><CookieConsent />{children}</body>
    </html>
  );
}
