import type { Metadata, Viewport } from "next";
import "@/styles/tokens.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Ramakrishna | Full-stack and AI automation developer",
  description:
    "Ramakrishna is a full-stack and AI automation developer in Mumbai. Four projects told as problems solved, with the numbers: strike shifting cut from 45-60 s to 2-3 s, an AI review cut from 18.8 s to 3.35 s, and 1,212 passing tests.",
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
      <body>{children}</body>
    </html>
  );
}
