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
          <span className="dot" aria-hidden="true" /> Open to software
          engineering opportunities
        </p>
        <h1 id="hero-title">
          I build software that makes complex work{" "}
          <span className="accent">faster, simpler and more reliable</span>.
        </h1>
        <p className="lede">
          I take workflows that are slow, repetitive or easy to get wrong and turn
          them into software people can rely on.
        </p>
        <p className="lede-sub">
          My work covers full-stack apps, backend systems, real-time
          communication, AI automation and infrastructure. I start with the
          problem, make sensible engineering decisions, and measure whether the
          result is actually better.
        </p>
        <div className="cta">
          <a className="btn primary" href="#work">
            View my work
          </a>
          <a
            className="btn"
            href="/resume.pdf"
            download="Ramakrishna-Resume.pdf"
          >
            Download resume
          </a>
        </div>
        <div className="hero-info" aria-label="Quick facts">
          <span>India</span>
          <span className="sep" aria-hidden="true">
            |
          </span>
          <span>BITS Pilani, Computer Science</span>
          <span className="sep" aria-hidden="true">
            |
          </span>
          <span>2026 graduate</span>
        </div>
      </div>

      <table className="titleblock" aria-label="Overview facts">
        <tbody>
          <tr>
            <th scope="row">BASED</th>
            <td>
              <b>India</b>
            </td>
          </tr>
          <tr>
            <th scope="row">EDUCATION</th>
            <td>
              <b>BITS Pilani, Computer Science</b>
            </td>
          </tr>
          <tr>
            <th scope="row">GRADUATED</th>
            <td>
              <b>2026</b>
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
