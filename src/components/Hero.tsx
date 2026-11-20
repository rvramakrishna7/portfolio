export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <svg
        className="grid-art"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="minor"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.55"
            />
          </pattern>
          <pattern
            id="major"
            width="160"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M160 0H0V160"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#minor)" />
        <g className="major">
          <rect width="100%" height="100%" fill="url(#major)" />
        </g>
      </svg>

      <div className="wrap">
        <p className="status">
          <span className="dot" aria-hidden="true" /> Open to full-stack and AI
          automation roles
        </p>
        <h1 id="hero-title">
          Traders lost a minute every time they moved a strike. Now it takes{" "}
          <span className="accent">a few seconds</span>.
        </h1>
        <p className="lede">
          <strong>I&apos;m Ramakrishna.</strong> I make AI-powered products work
          in the real world, and I keep the numbers to prove it. Below are four
          of them, told as problems that got solved.
        </p>
        <div className="cta">
          <a className="btn primary" href="#work">
            Read the four stories
          </a>
          <a className="btn" href="#contact">
            Get in touch
          </a>
        </div>
      </div>

      <table className="titleblock" aria-label="Summary of the work">
        <tbody>
          <tr>
            <th scope="row">DEVELOPER</th>
            <td>
              <b>Ramakrishna</b>
            </td>
          </tr>
          <tr>
            <th scope="row">BASE</th>
            <td>
              <b>Mumbai, India</b>
            </td>
          </tr>
          <tr>
            <th scope="row">PROJECTS</th>
            <td>
              <b>04 shipped</b>
            </td>
          </tr>
          <tr>
            <th scope="row">TESTS PASSING</th>
            <td>
              <b>1,212</b>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="scrollcue" aria-hidden="true">
        Scroll down
      </div>
    </section>
  );
}
