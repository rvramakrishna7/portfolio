import type { Metadata } from "next";
import { Contact } from "@/components/Contact";
import { Experience } from "@/components/Experience";
import { Hero } from "@/components/Hero";
import { ProofStrip } from "@/components/ProofStrip";
import { Skills } from "@/components/Skills";
import { Work } from "@/components/Work";
import { absoluteUrl } from "@/lib/site";

const title = "Ramakrishna | Full-stack and AI automation developer";
const description =
  "Full-stack and AI automation developer in Mumbai. Four projects told as problems solved: strike shifting in 2-3 s, AI review in 3.35 s, 1,212 passing tests.";

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
      jobTitle: "Full-stack and AI automation developer",
      url: absoluteUrl("/"),
      sameAs: [
        "https://www.linkedin.com/in/rvramakrishna",
        "https://github.com/rvramakrishna7",
      ],
      address: {
        "@type": "PostalAddress",
        addressLocality: "Mumbai",
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
      <Work />
      <Experience />
      <Skills />
      <Contact />
    </main>
  );
}
