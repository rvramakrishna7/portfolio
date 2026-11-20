import type { Metadata } from "next";
import { Contact } from "@/components/Contact";
import { Experience } from "@/components/Experience";
import { Hero } from "@/components/Hero";
import { ProofStrip } from "@/components/ProofStrip";
import { Skills } from "@/components/Skills";
import { Work } from "@/components/Work";

export const metadata: Metadata = {
  title: "Ramakrishna | Full-stack and AI automation developer",
  description:
    "Ramakrishna is a full-stack and AI automation developer in Mumbai. Four projects told as problems solved, with the numbers: strike shifting cut from 45-60 s to 2-3 s, an AI review cut from 18.8 s to 3.35 s, and 1,212 passing tests.",
};

export default function HomePage() {
  return (
    <main id="main" tabIndex={-1}>
      <Hero />
      <ProofStrip />
      <Work />
      <Experience />
      <Skills />
      <Contact />
    </main>
  );
}
