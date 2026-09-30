import {
  GetRecallNewsQueryParams,
  GetRecallNewsResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import {
  buildNewsQuery,
  getNewsDateRange,
  isNewsApiAllowed,
  NEWS_API_RESULT_LIMIT,
  normalizeNewsArticles,
  normalizeNewsSearchTerm,
} from "../lib/recallNews";

const router: IRouter = Router();
const NEWS_API_SEARCH_URL = "https://newsapi.org/v2/everything";
const NEWS_API_REQUEST_TIMEOUT_MS = 8_000;

interface NewsApiResponse {
  status?: unknown;
  articles?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

router.get("/recalls/news", async (req, res) => {
  const parsed = GetRecallNewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "A product search term is required." });
    return;
  }

  const term = normalizeNewsSearchTerm(parsed.data.term);
  if (!term) {
    res.status(400).json({ message: "A product search term is required." });
    return;
  }

  const dateRange = getNewsDateRange();
  const apiKey = process.env.NEWSAPI_API_KEY?.trim();
  const emptyResponse = (unavailable: boolean) =>
    GetRecallNewsResponse.parse({
      articles: [],
      unavailable,
      dateRange,
    });

  if (
    !isNewsApiAllowed(
      process.env.NODE_ENV,
      process.env.NEWSAPI_ALLOW_NON_DEVELOPMENT,
    )
  ) {
    logger.warn(
      { term, dateRange, unavailable: true },
      "NewsAPI disabled outside development until eligible access is configured",
    );
    res.json(emptyResponse(true));
    return;
  }

  if (!apiKey) {
    logger.warn(
      { term, dateRange, unavailable: true },
      "NewsAPI skipped because its server-side API key is not configured",
    );
    res.json(emptyResponse(true));
    return;
  }

  const query = buildNewsQuery(term);
  const params = new URLSearchParams({
    q: query,
    searchIn: "title,description",
    from: dateRange.from,
    to: dateRange.to,
    language: "en",
    sortBy: "publishedAt",
    pageSize: String(NEWS_API_RESULT_LIMIT),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    NEWS_API_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${NEWS_API_SEARCH_URL}?${params.toString()}`, {
      headers: { accept: "application/json", "X-Api-Key": apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        {
          term,
          query,
          dateRange,
          upstreamStatus: response.status,
          unavailable: true,
        },
        "NewsAPI search was unavailable",
      );
      res.json(emptyResponse(true));
      return;
    }

    const payload = (await response.json()) as NewsApiResponse;
    if (
      !isRecord(payload) ||
      payload.status !== "ok" ||
      !Array.isArray(payload.articles)
    ) {
      logger.warn(
        { term, query, dateRange, unavailable: true },
        "NewsAPI returned an invalid search payload",
      );
      res.json(emptyResponse(true));
      return;
    }
    const articles = normalizeNewsArticles(
      payload.articles,
      dateRange.from,
      dateRange.to,
    );
    logger.info(
      {
        term,
        query,
        dateRange,
        articleCount: articles.length,
        unavailable: false,
      },
      "NewsAPI recent recall search completed",
    );
    res.json(
      GetRecallNewsResponse.parse({
        articles,
        unavailable: false,
        dateRange,
      }),
    );
  } catch {
    logger.warn(
      { term, query, dateRange, unavailable: true },
      "NewsAPI request failed; continuing without news mentions",
    );
    res.json(emptyResponse(true));
  } finally {
    clearTimeout(timeoutId);
  }
});

export default router;