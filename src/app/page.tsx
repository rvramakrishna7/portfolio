import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ramakrishna | Full-stack and AI automation developer",
  description:
    "Ramakrishna is a full-stack and AI automation developer in Mumbai. Four projects told as problems solved, with the numbers: strike shifting cut from 45-60 s to 2-3 s, an AI review cut from 18.8 s to 3.35 s, and 1,212 passing tests.",
};

export default function HomePage() {
  return (
    <main id="main" className="home-shell-placeholder" tabIndex={-1}>
      <h1>Ramakrishna</h1>
    </main>
  );
}
