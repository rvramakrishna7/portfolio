const EXPERIENCE_ITEMS = [
  "Built the part that follows every call through its states, and ignores late messages so a finished call never flips back to active.",
  "Built 8 voice tools for the agent (booking, availability, leads, opt-outs, transfer and more) with replay protection, so a retried call never books twice. Connected Cal.com so the agent books live; 2 staging calls ended in real bookings.",
  "Added checks before any call is placed: number format, consent, the suppression list and the recipient's own 9am to 6pm window. That stops wasted credits and carrier trouble.",
  "Found a gateway that answered 200 with no login token, and added JWT and role checks.",
  "Chose hosting from numbers: FastAPI on Cloudflare Workers took 4 s to start but answered warm requests in 110 to 130 ms. Backed the work with 2,000+ automated tests.",
] as const;

export function Experience() {
  return (
    <section className="block" id="experience" aria-labelledby="exp-title">
      <div className="wrap exp">
        <div>
          <p className="eyebrow">Experience &middot; Aug 2026 – Nov 2026, remote</p>
          <h2 id="exp-title">AI and Automation Engineer Intern</h2>
          <p className="company-tag">Luxecurio Pvt Ltd (SonicVocal)</p>
          <p className="intro">
            I worked on an AI phone-calling product for US businesses. The agent
            books appointments over the phone, so the product has to be right
            even when a call is retried, late or dropped.
          </p>
          <p className="nda">
            This work is under NDA, so there is no public link. I&apos;m happy
            to walk through it in an interview.
          </p>
        </div>
        <ol aria-label="Experience details">
          {EXPERIENCE_ITEMS.map((item, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            return (
              <li key={num} data-n={num}>
                {item}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
