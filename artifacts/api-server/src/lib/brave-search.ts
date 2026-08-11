/**
 * Brave Search utility — thin wrapper around the Brave Web Search API.
 *
 * Reads BRAVE_SEARCH_API_KEY from env. If the key is absent, returns an empty
 * array and logs a warning so callers can degrade gracefully.
 */

import { logger } from "./logger";

export interface BraveResult {
  title: string;
  url: string;
  snippet: string;
}

const BRAVE_API_KEY = process.env["BRAVE_SEARCH_API_KEY"];

if (!BRAVE_API_KEY) {
  logger.warn("BRAVE_SEARCH_API_KEY is not set — web search will be skipped in AI briefs");
}

/**
 * Run a single Brave web search query.
 * Returns up to `count` results (default 5). Returns [] on any error.
 */
export async function searchBrave(query: string, count = 5): Promise<BraveResult[]> {
  if (!BRAVE_API_KEY) {
    return [];
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, query }, "Brave Search returned non-200");
      return [];
    }

    const data = (await resp.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
        }>;
      };
    };

    const results: BraveResult[] = (data.web?.results ?? []).slice(0, count).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? "",
    }));

    return results;
  } catch (err) {
    logger.warn({ err, query }, "Brave Search fetch error");
    return [];
  }
}
