import type { Metadata } from "next";
import { About } from "@/components/About";
import { Contact } from "@/components/Contact";
import { Experience } from "@/components/Experience";
import { Hero } from "@/components/Hero";
import { ProofStrip } from "@/components/ProofStrip";
import { Skills } from "@/components/Skills";
import { Work } from "@/components/Work";
import { absoluteUrl } from "@/lib/site";

const title = "Ramakrishna | Software Engineer (Full-Stack, Backend, AI)";
const description =
  "Software engineer in India (BITS Pilani, 2026). Four projects told as problems solved: options automation, AI claim checks, an MCP gateway, video meetings.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Ramakrishna",
    title,
    description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#site"),
      url: absoluteUrl("/"),
      name: "Ramakrishna",
      inLanguage: "en",
      publisher: {
        "@id": absoluteUrl("/#person"),
      },
    },
    {
      "@type": "Person",
      "@id": absoluteUrl("/#person"),
      name: "Ramakrishna",
      jobTitle: "Software Engineer",
      url: absoluteUrl("/"),
      sameAs: [
        "https://www.linkedin.com/in/rvramakrishna",
        "https://github.com/rvramakrishna7",
      ],
      address: {
        "@type": "PostalAddress",
        addressCountry: "India",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <main id="main" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <Hero />
      <ProofStrip />
      <Experience />
      <Work />
      <Skills />
      <About />
      <Contact />
    </main>
  );
}
