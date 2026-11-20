import type { MetadataRoute } from "next";
import { STORIES } from "@/content/stories";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const storyEntries = STORIES.map((story) => ({
    url: absoluteUrl(`/work/${story.slug}`),
    lastModified: new Date("2026-11-20"),
  }));

  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date("2026-11-20"),
    },
    ...storyEntries,
  ];
}
