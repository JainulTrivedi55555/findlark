import type { Metadata, Viewport } from "next";
// The `geist` package ships the font files, so build and dev need no network
// (next/font/google downloads them from Google at build time).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
// Display face, bundled from npm (woff2 files are emitted into the build; no CDN).
import "@fontsource-variable/fraunces/wght.css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Findlark", template: "%s · Findlark" },
  description: "Describe who you are hiring in plain English and get a ranked list of matching candidates.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the bottom nav pad itself for the iPhone home indicator.
  viewportFit: "cover",
  themeColor: "#f6f1e7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
