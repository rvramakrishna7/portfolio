import type { Metadata, Viewport } from "next";
import { BackToTop } from "@/components/BackToTop";
import { CommandPalette } from "@/components/CommandPalette";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ReadingProgress } from "@/components/ReadingProgress";
import { SkipLink } from "@/components/SkipLink";
import { getSiteUrl } from "@/lib/site";
import "@/styles/tokens.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0D" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.addEventListener('DOMContentLoaded',function(){setTimeout(function(){document.documentElement.classList.add('theme-ready');},50);});`,
          }}
        />
      </head>
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
