import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STORIES } from "@/content/stories";
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

  const title = `${story.title}: ${story.tag} | Ramakrishna`;
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
          alt: "Ramakrishna | Full-stack and AI automation developer",
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
      <div className="case-hero">
        <div className="wrap">
          <p className="crumbs">
            <Link href="/">Home</Link> / <Link href="/#work">Work</Link> /{" "}
            <span aria-current="page">{story.title}</span>
          </p>
          <p className="eyebrow">{story.tag}</p>
          <h1>{story.title}</h1>
          <p className="hook">{story.hook}</p>
          <ul className="chips" aria-label="Built with">
            {story.chips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="wrap case-body">
        <section>
          <h2>The problem</h2>
          <p>{story.problem}</p>
        </section>
        <section>
          <h2>The constraint</h2>
          <p>{story.constraint}</p>
        </section>
        <section>
          <h2>What I did</h2>
          <ul>
            {story.whatIDid.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2>The result</h2>
          <div className="results">
            {story.results.map((res, idx) => (
              <div key={idx}>
                <strong>{res.value}</strong>
                <span>{res.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Proof</h2>
          <div className="links">
            {story.liveUrl ? (
              <a
                href={story.liveUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open the live site
              </a>
            ) : null}
            <a
              href={story.codeUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              See the code
            </a>
          </div>
        </section>
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
