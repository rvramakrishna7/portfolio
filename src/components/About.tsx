export function About() {
  return (
    <section className="block about-sec" id="about" aria-labelledby="about-title">
      <div className="wrap about-grid">
        <div className="about-copy">
          <p className="eyebrow">About</p>
          <h2 id="about-title">How I work</h2>
          <p>
            I like to understand how something works before I decide how to build
            it.
          </p>
          <p>
            Most of my projects started with a workflow that took too much
            manual effort, or one that broke when something unexpected happened.
            I enjoy working through those details, building the system and
            testing it under real conditions.
          </p>
          <p>
            I use AI coding tools too. I review the decisions they make, read the
            code, and check behaviour with tests and real runs.
          </p>
        </div>

        <div className="about-sidebar">
          <div className="about-card">
            <h3>Education</h3>
            <p className="about-degree">
              <strong>BS Computer Science</strong>, BITS Pilani, 2026.
            </p>
          </div>
          <div className="about-card">
            <h3>Certifications</h3>
            <ul
              className="about-certs"
              aria-label="Professional certifications"
            >
              <li>NISM Series VIII Equity Derivatives (SEBI)</li>
              <li>Meta Backend Developer Professional Certificate</li>
              <li>Google IT Automation with Python</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
