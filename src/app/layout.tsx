import type { Metadata, Viewport } from "next";
import { BackToTop } from "@/components/BackToTop";
import { CommandPalette } from "@/components/CommandPalette";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ReadingProgress } from "@/components/ReadingProgress";
import { SkipLink } from "@/components/SkipLink";
import "@/styles/tokens.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <ReadingProgress />
        <Header />
        <CommandPalette />
        {children}
        <Footer />
        <BackToTop />
      </body>
    </html>
  );
}
