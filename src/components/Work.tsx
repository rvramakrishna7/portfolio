import Link from "next/link";
import { ChapterReveal } from "@/components/ChapterReveal";
import { STORIES } from "@/content/stories";

export function Work() {
  return (
    <section className="block" id="work" aria-labelledby="work-title">
      <ChapterReveal />
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow">Selected work</p>
          <h2 id="work-title">Four problems, what I built, and what I measured.</h2>
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
              <p className="tag">{story.category}</p>
              <ul className="chips" aria-label="Built with">
                {story.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </div>

            <div className="panel">
              <p className="hook">{story.headline}</p>

              <div>
                <h4>The problem</h4>
                <p>{story.problemShort}</p>
              </div>

              <div>
                <h4>What I built</h4>
                <p>{story.builtShort}</p>
              </div>

              <div>
                <h4>Results</h4>
                <div className="results">
                  {story.metrics.map((m) => (
                    <div key={m.label}>
                      <strong>{m.value}</strong>
                      <span>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="links">
                <Link href={`/work/${story.slug}`}>Read the story</Link>
                {story.live ? (
                  <a
                    href={story.live}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the live site
                  </a>
                ) : null}
                <a
                  href={story.code}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See the code
                </a>
              </div>
            </div>
          </article>
        ))}

        <div className="additional-projects" aria-label="Additional projects">
          <p className="eyebrow">Additional projects</p>
          <div className="additional-card">
            <p>
              <strong>Book My Nest</strong>: A property listing site where people
              browse listings and view property details. Node.js, Express,
              MongoDB, Passport.js, Cloudinary, Mapbox.{" "}
              <a
                href="https://bookmynest.onrender.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Live
              </a>{" "}
              (free host, can take a moment to wake).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
