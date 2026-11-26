import { safeFetch, SafeFetchOptions } from "../inbound/safe-fetch";
import { joinBrokenLines, needsLogin, stripMarkup } from "./description-text";

export interface FetchedDescription {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Reads the text of a public job page. LinkedIn and other login pages are not fetched. */
export async function fetchDescriptionFromUrl(url: string, options?: SafeFetchOptions): Promise<FetchedDescription> {
  if (!url) return { ok: false, error: "This job has no link" };
  if (needsLogin(url)) {
    return {
      ok: false,
      error: "LinkedIn needs a login, so it cannot be read from here. Open the post, copy the description and paste it below.",
    };
  }
  const res = await safeFetch(url, options);
  if (!res.ok) return { ok: false, error: `Could not open the link (${res.error || res.status})` };
  const text = joinBrokenLines(stripMarkup(res.body)).slice(0, 8000).trim();
  if (text.length < 200) {
    return {
      ok: false,
      error: "The page has no readable text (it may need a login or load with JavaScript). Paste the description below.",
    };
  }
  return { ok: true, text };
}
