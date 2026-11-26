const EXPERIENCE_ITEMS = [
  "Stopped finished calls from flipping back to active. I built the call-state handling for Vapi webhooks, so a late or out-of-order event cannot reopen a call that has ended.",
  "Made the agent's tools safe to retry. I worked on eight tools (booking, availability, leads, contacts, opt-outs, callbacks, transfers and more) and added idempotency checks so a retried request cannot book or record the same thing twice.",
  "Connected Cal.com v2 for live availability and booking. Two staging calls ended in confirmed bookings.",
  "Added checks before every outbound call: phone number format, consent, suppression list, the recipient's local calling window, and capacity limits.",
  "Worked on campaign pause, resume and cancel, and added protection against duplicate campaign jobs.",
  "Closed an authorization gap in the Cloudflare Worker gateway, which answered requests that carried no login token, by adding JWT and role checks.",
  "Measured FastAPI on Cloudflare Workers before choosing it: about 4 seconds for a cold start and 110 to 130 ms for warm requests in the benchmark I ran.",
] as const;

export function Experience() {
  return (
    <section className="block" id="experience" aria-labelledby="exp-title">
      <div className="wrap exp">
        <div>
          <p className="eyebrow">Experience</p>
          <h2 id="exp-title">
            A business shouldn&apos;t lose a customer just because nobody can
            answer the phone.
          </h2>
          <div className="exp-card">
            <p className="exp-role">AI and Automation Engineer Intern</p>
            <p className="exp-company">Luxecurio Pvt Ltd (SonicVocal)</p>
            <p className="exp-meta">
              <span className="exp-chip">Remote</span>
              <span className="exp-chip">August 2026 to November 2026</span>
            </p>
          </div>
          <p className="intro">
            Businesses lose opportunities when calls go unanswered because the
            owner or staff are busy. Someone has to pick up, understand the
            request, check the calendar and book the appointment manually.
          </p>
          <p className="product-desc">
            SonicVocal is an AI voice platform for businesses. Its agent answers
            real phone calls, understands what the caller needs, answers common
            questions from a knowledge base, checks availability and books
            appointments through Cal.com, records leads and contacts, takes
            callback and opt-out requests, and transfers to a human when needed.
            It also runs outbound calling campaigns.
          </p>
          <div className="nda">
            Some implementation details are confidential. I&apos;m happy to walk
            through my engineering contributions and the architecture in an
            interview.
          </div>
        </div>
        <div>
          <ol aria-label="Experience contributions">
            {EXPERIENCE_ITEMS.map((item, idx) => {
              const num = String(idx + 1).padStart(2, "0");
              return (
                <li key={num} data-n={num}>
                  {item}
                </li>
              );
            })}
          </ol>
          <p className="exp-testing">
            2,026 automated tests in the modules I owned, out of 2,239 in the
            full repository suite as reported.
          </p>
        </div>
      </div>
    </section>
  );
}
