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
  totalResults?: unknown;
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
  const requestUrl = `${NEWS_API_SEARCH_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    NEWS_API_REQUEST_TIMEOUT_MS,
  );

  try {
    logger.info(
      { term, query, requestUrl, dateRange },
      "NewsAPI request started",
    );
    const response = await fetch(requestUrl, {
      headers: { accept: "application/json", "X-Api-Key": apiKey },
      signal: controller.signal,
    });
    const responseBody = await response.text();
    if (!response.ok) {
      logger.warn(
        {
          term,
          query,
          requestUrl,
          dateRange,
          upstreamStatus: response.status,
          rawResponsePreview: responseBody.slice(0, 2_000),
          unavailable: true,
        },
        "NewsAPI search was unavailable",
      );
      res.json(emptyResponse(true));
      return;
    }

    let payload: NewsApiResponse;
    try {
      payload = JSON.parse(responseBody) as NewsApiResponse;
    } catch {
      logger.warn(
        {
          term,
          query,
          requestUrl,
          dateRange,
          upstreamStatus: response.status,
          rawResponsePreview: responseBody.slice(0, 2_000),
          unavailable: true,
        },
        "NewsAPI returned an unreadable response",
      );
      res.json(emptyResponse(true));
      return;
    }
    if (
      !isRecord(payload) ||
      payload.status !== "ok" ||
      !Array.isArray(payload.articles)
    ) {
      logger.warn(
        {
          term,
          query,
          requestUrl,
          dateRange,
          upstreamStatus: response.status,
          rawResponsePreview: responseBody.slice(0, 2_000),
          unavailable: true,
        },
        "NewsAPI returned an invalid search payload",
      );
      res.json(emptyResponse(true));
      return;
    }
    const rawArticles = payload.articles;
    const articles = normalizeNewsArticles(
      rawArticles,
      dateRange.from,
      dateRange.to,
      term,
    );
    logger.info(
      {
        term,
        query,
        requestUrl,
        dateRange,
        upstreamStatus: response.status,
        totalResults:
          typeof payload.totalResults === "number"
            ? payload.totalResults
            : undefined,
        rawArticleCount: rawArticles.length,
        normalizedArticleCount: articles.length,
        rawArticleSample: rawArticles.slice(0, 5).flatMap((article) => {
          if (!isRecord(article)) return [];
          const source = isRecord(article.source) ? article.source.name : undefined;
          return [{
            title: typeof article.title === "string" ? article.title : undefined,
            source: typeof source === "string" ? source : undefined,
            publishedAt:
              typeof article.publishedAt === "string"
                ? article.publishedAt
                : undefined,
            url: typeof article.url === "string" ? article.url : undefined,
          }];
        }),
        rawResponsePreview: responseBody.slice(0, 2_000),
        unavailable: false,
      },
      "NewsAPI response received and normalized",
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
      { term, query, requestUrl, dateRange, unavailable: true },
      "NewsAPI request failed; continuing without news mentions",
    );
    res.json(emptyResponse(true));
  } finally {
    clearTimeout(timeoutId);
  }
});

export default router;