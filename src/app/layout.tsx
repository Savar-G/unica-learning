import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Caveat, Geist, Geist_Mono, Gochi_Hand } from "next/font/google";
import { BRAND, HERO } from "@/lib/site";
import "./globals.css";
import "./looks.css";

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

const title = `${BRAND}: Personalized. Delivered. Mastered.`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title,
  description: `${HERO.sub} Grades 3-5 in Metro Vancouver.`,
  openGraph: { title, description: HERO.sub, type: "website", locale: "en_CA" },
  twitter: { card: "summary_large_image", title, description: HERO.sub },
  // Keep previews out of search until launch (set NEXT_PUBLIC_ALLOW_INDEX=true on the launch deploy).
  robots: process.env.NEXT_PUBLIC_ALLOW_INDEX === "true" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${zodiak.variable} ${switzer.variable} ${kid.variable} ${pen.variable} ${geist.variable} ${geistMono.variable}`}>
      <head>
        {/* Reveal animations only hide content once JavaScript is running. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
