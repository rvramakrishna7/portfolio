import { CountUp } from "@/components/CountUp";

interface ProofCard {
  value: string;
  countUpTarget?: number;
  meaning: string;
  howMeasured: string;
}

const PROOF_CARDS: readonly ProofCard[] = [
  {
    value: "1,212",
    countUpTarget: 1212,
    meaning: "automated tests passing",
    howMeasured:
      "In the MCP gateway project. I ran all of them on 2026-11-19: 497 in the gateway, 396 in the dashboard, 225 and 94 in two tool servers.",
  },
  {
    value: "98–100",
    meaning: "Lighthouse on three live apps",
    howMeasured:
      "Desktop preset. Zync 100, Restart Options 99, Vouch 98. Measured 2026-11-19.",
  },
  {
    value: "18.8 s → 3.35 s",
    meaning: "AI review time in Vouch",
    howMeasured:
      "The first number is one run before the change. The second is the average of 10 runs after, with all 50 claim verdicts correct.",
  },
  {
    value: "45–60 s → 2–3 s",
    meaning: "moving a strike in Restart Options",
    howMeasured: "Timed with a stopwatch: by hand before, automatic after.",
  },
];

export function ProofStrip() {
  return (
    <section className="proof" id="proof" aria-labelledby="proof-title">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow">The short version</p>
          <h2 id="proof-title">Four numbers, and how I got them.</h2>
        </div>
        <div className="proof-grid">
          {PROOF_CARDS.map((card) => (
            <div className="stat" key={card.meaning}>
              <span className="big">
                {card.countUpTarget !== undefined ? (
                  <CountUp
                    target={card.countUpTarget}
                    initialText={card.value}
                  />
                ) : (
                  card.value
                )}
              </span>
              <span className="what">{card.meaning}</span>
              <details className="stat-details">
                <summary>How was this measured?</summary>
                <p className="how">{card.howMeasured}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
