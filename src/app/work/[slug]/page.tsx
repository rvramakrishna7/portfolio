import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BeforeAfterBars,
  McpArchitecture,
  VouchPipeline,
  ZyncMediaFlow,
} from "@/components/diagrams";
import { STORIES, type Story } from "@/content/stories";
import { absoluteUrl } from "@/lib/site";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return STORIES.map((story) => ({
    slug: story.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = STORIES.find((s) => s.slug === slug);

  if (!story) {
    return {
      title: "Story not found | Ramakrishna",
    };
  }

  const title = story.seoTitle;
  const description = story.seoDescription;
  const canonical = `/work/${story.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Ramakrishna",
      type: "article",
      images: [
        {
          url: absoluteUrl("/opengraph-image"),
          width: 1200,
          height: 630,
          alt: "Ramakrishna | Software Engineer (Full-Stack, Backend, AI)",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

function Diagram({ name }: { name: Story["diagram"] }) {
  switch (name) {
    case "BeforeAfterBars":
      return <BeforeAfterBars />;
    case "McpArchitecture":
      return <McpArchitecture />;
    case "VouchPipeline":
      return <VouchPipeline />;
    case "ZyncMediaFlow":
      return <ZyncMediaFlow />;
    default:
      return null;
  }
}

export default async function StoryPage({ params }: PageProps) {
  const { slug } = await params;
  const storyIndex = STORIES.findIndex((s) => s.slug === slug);

  if (storyIndex === -1) {
    notFound();
  }

  const story = STORIES[storyIndex];
  const prevStory =
    STORIES[(storyIndex - 1 + STORIES.length) % STORIES.length];
  const nextStory = STORIES[(storyIndex + 1) % STORIES.length];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Work",
        item: absoluteUrl("/#work"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: story.title,
        item: absoluteUrl(`/work/${story.slug}`),
      },
    ],
  };

  return (
    <main id="main" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Part 1: Breadcrumb, category tag, H1 (project title), headline sentence, tech tags */}
      <div className="case-hero">
        <div className="wrap">
          <p className="crumbs">
            <Link href="/">Home</Link> / <Link href="/#work">Work</Link> /{" "}
            <span aria-current="page">{story.title}</span>
          </p>
          <p className="eyebrow">{story.category}</p>
          <h1>{story.title}</h1>
          <p className="hook">{story.headline}</p>
          <ul className="chips" aria-label="Built with">
            {story.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="wrap case-body">
        {/* Part 2: The problem */}
        <section>
          <h2>The problem</h2>
          <div>
            <p>{story.problem}</p>
          </div>
        </section>

        {/* Part 3: Why the usual way fell short */}
        {story.whyItFellShort ? (
          <section>
            <h2>Why the usual way fell short</h2>
            <div>
              <p>{story.whyItFellShort}</p>
            </div>
          </section>
        ) : null}

        {/* Part 4: What I built (includes inline SVG diagram) */}
        <section>
          <h2>What I built</h2>
          <div>
            <p>{story.built}</p>
            {story.deterministicChecks ? (
              <div style={{ marginTop: "16px" }}>
                <p>
                  <strong>Deterministic checks:</strong>
                </p>
                <ul>
                  {story.deterministicChecks.map((check, idx) => (
                    <li key={idx}>{check}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Diagram name={story.diagram} />
          </div>
        </section>

        {/* Part 5: Engineering decisions */}
        <section>
          <h2>Engineering decisions</h2>
          <div>
            <ul>
              {story.decisions.map((decision, idx) => (
                <li key={idx}>{decision}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Part 6: Reliability, security and failure handling (omitted if project has nothing real to say) */}
        {story.reliability ? (
          <section>
            <h2>Reliability, security and failure handling</h2>
            <div>
              <p>{story.reliability}</p>
            </div>
          </section>
        ) : null}

        {/* Part 7: Results (table: measure | value | how it was measured) */}
        <section>
          <h2>Results</h2>
          <div>
            <div
              className="case-results-wrap"
              tabIndex={0}
              role="region"
              aria-label="Results table"
            >
              <table className="case-results-table">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">Value</th>
                    <th scope="col">How it was measured</th>
                  </tr>
                </thead>
                <tbody>
                  {story.resultsTable.map((row, idx) => (
                    <tr key={idx}>
                      <th scope="row">{row.measure}</th>
                      <td>
                        <strong>{row.value}</strong>
                      </td>
                      <td>{row.howMeasured}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {story.honestNote ? (
              <div className="case-note">
                <p>
                  <strong>Note:</strong> {story.honestNote}
                </p>
              </div>
            ) : null}

            {story.hackathonNote ? (
              <div className="case-note">
                <p>{story.hackathonNote}</p>
              </div>
            ) : null}

            {story.hardenNext ? (
              <div className="case-note">
                <p>
                  <strong>What I would harden next:</strong>
                </p>
                <ul>
                  {story.hardenNext.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        {/* Part 8: Built with, then links */}
        <section>
          <h2>Built with</h2>
          <div>
            <ul className="chips" aria-label="Built with technologies">
              {story.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <div className="case-links">
              {story.live ? (
                <a
                  className="btn primary"
                  href={story.live}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open the live site
                </a>
              ) : null}
              <a
                className="btn"
                href={story.code}
                rel="noopener noreferrer"
                target="_blank"
              >
                See the code
              </a>
            </div>
          </div>
        </section>

        {/* Part 9: Pager (order: Restart Options, MCP Gateway, Vouch, Zync, wrapping around) */}
        <nav className="pager" aria-label="More stories">
          <Link href={`/work/${prevStory.slug}`}>
            <small>&larr; Previous</small>
            <span>{prevStory.title}</span>
          </Link>
          <Link className="next" href={`/work/${nextStory.slug}`}>
            <small>Next &rarr;</small>
            <span>{nextStory.title}</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
