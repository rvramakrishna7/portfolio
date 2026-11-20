import Link from "next/link";
import { ChapterReveal } from "@/components/ChapterReveal";
import { STORIES } from "@/content/stories";

export function Work() {
  return (
    <section className="block" id="work" aria-labelledby="work-title">
      <ChapterReveal />
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow">Work</p>
          <h2 id="work-title">Four problems, and what happened next.</h2>
          <p>
            Each one starts with a person who had a real problem. Scroll, and
            each story opens.
          </p>
        </div>

        {STORIES.map((story) => (
          <article
            className="chapter reveal"
            id={story.slug}
            key={story.slug}
          >
            <div className="meta">
              <span className="num" aria-hidden="true">
                <svg
                  className="num-svg"
                  viewBox="0 0 120 84"
                  aria-hidden="true"
                  focusable="false"
                >
                  <text
                    x="0"
                    y="72"
                    fill="currentColor"
                    fontFamily="var(--serif)"
                    fontSize="80"
                    fontWeight="600"
                  >
                    {story.number}
                  </text>
                </svg>
              </span>
              <h3>{story.title}</h3>
              <p className="tag">{story.tag}</p>
              <ul className="chips" aria-label="Built with">
                {story.chips.map((chip) => (
                  <li key={chip}>{chip}</li>
                ))}
              </ul>
            </div>

            <div className="panel">
              <p className="hook">{story.hook}</p>

              <div>
                <h4>The problem</h4>
                <p>{story.problem}</p>
              </div>

              <div>
                <h4>What I did</h4>
                <ul>
                  {story.whatIDid.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4>The result</h4>
                <div className="results">
                  {story.results.map((res) => (
                    <div key={res.label}>
                      <strong>{res.value}</strong>
                      <span>{res.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="links">
                {story.links.map((link) =>
                  link.external ? (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.href} href={link.href}>
                      {link.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          </article>
        ))}

        <p className="form-note work-note">
          Earlier work: Book My Nest, a property listing site built with
          Node.js, Express, MongoDB, Passport.js, Cloudinary and Mapbox.{" "}
          <a
            href="https://bookmynest.onrender.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            See it live
          </a>{" "}
          (the free host can take a moment to wake up).
        </p>
      </div>
    </section>
  );
}
