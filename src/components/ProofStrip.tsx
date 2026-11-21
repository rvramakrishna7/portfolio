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
      "In the MCP gateway project. 900 run without a database: 185 in the gateway, 396 in the dashboard, 225 and 94 in two tool servers. 312 more gateway tests need PostgreSQL, which gives 1,212. The full 1,212 run was on 2026-11-19; the 900 figure was re-run in the R0 audit on 2026-11-21.",
  },
  {
    value: "98 to 100",
    meaning: "Lighthouse on three live apps",
    howMeasured:
      "Desktop preset. Zync 100, Restart Options 99, Vouch 98. Measured 2026-11-19.",
  },
  {
    value: "18.83 s → 3.35 s",
    meaning: "AI review time in Vouch",
    howMeasured:
      "The first number is one measurement before the change. The second is the average of 10 runs after, with all 50 claim verdicts correct.",
  },
  {
    value: "45 to 60 s → 2 to 3 s",
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
                <summary>
                  <span className="summary-closed">How was this measured?</span>
                  <span className="summary-open">Hide</span>
                </summary>
                <p className="how">{card.howMeasured}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
