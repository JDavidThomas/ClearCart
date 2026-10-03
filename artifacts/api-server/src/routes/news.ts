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

function createNewsApiRequest(
  term: string,
  dateRange: ReturnType<typeof getNewsDateRange>,
) {
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

  return {
    query,
    requestUrl: `${NEWS_API_SEARCH_URL}?${params.toString()}`,
  };
}

async function fetchNewsApiResponse(requestUrl: string, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    NEWS_API_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(requestUrl, {
      headers: { accept: "application/json", "X-Api-Key": apiKey },
      signal: controller.signal,
    });
    return { response, responseBody: await response.text() };
  } finally {
    clearTimeout(timeoutId);
  }
}

router.get("/recalls/news", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const authorizationHeader = req.get("authorization");
  logger.info(
    {
      searchTerm: typeof req.query.term === "string" ? req.query.term : null,
      authorizationHeaderPresent: Boolean(authorizationHeader),
      authorizationHeaderPrefix: authorizationHeader?.slice(0, 8) ?? null,
    },
    "Recall news route request received",
  );

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

  const { query, requestUrl } = createNewsApiRequest(term, dateRange);

  try {
    logger.info(
      { term, query, requestUrl, dateRange },
      "NewsAPI request started",
    );
    const { response, responseBody } = await fetchNewsApiResponse(
      requestUrl,
      apiKey,
    );
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
    const normalizedResponse = GetRecallNewsResponse.parse({
      articles,
      unavailable: false,
      dateRange,
    });
    logger.info(
      {
        term,
        endpointPath: "/api/recalls/news",
        normalizedResponse,
      },
      "Normalized recall news response returned",
    );
    res.json(normalizedResponse);
  } catch (error) {
    logger.warn(
      {
        term,
        query,
        requestUrl,
        dateRange,
        error: error instanceof Error ? error.message : String(error),
        unavailable: true,
      },
      "NewsAPI request failed; continuing without news mentions",
    );
    res.json(emptyResponse(true));
  }
});

router.get("/recalls/news/debug", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    res.status(404).json({ message: "This debug endpoint is only available in development." });
    return;
  }

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

  if (
    !isNewsApiAllowed(
      process.env.NODE_ENV,
      process.env.NEWSAPI_ALLOW_NON_DEVELOPMENT,
    )
  ) {
    res.status(404).json({ message: "NewsAPI is not enabled in this environment." });
    return;
  }

  const apiKey = process.env.NEWSAPI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ message: "NewsAPI is not configured on the server." });
    return;
  }

  const dateRange = getNewsDateRange();
  const { query, requestUrl } = createNewsApiRequest(term, dateRange);

  try {
    const { response, responseBody } = await fetchNewsApiResponse(
      requestUrl,
      apiKey,
    );
    let payload: NewsApiResponse;

    try {
      payload = JSON.parse(responseBody) as NewsApiResponse;
    } catch {
      res.status(502).json({
        term,
        query,
        upstreamStatus: response.status,
        message: "NewsAPI returned an unreadable response.",
        rawResponsePreview: responseBody.slice(0, 2_000),
      });
      return;
    }

    if (!response.ok) {
      res.status(502).json({
        term,
        query,
        upstreamStatus: response.status,
        rawNewsApiResponse: payload,
      });
      return;
    }

    if (!isRecord(payload) || !Array.isArray(payload.articles)) {
      res.status(502).json({
        term,
        query,
        upstreamStatus: response.status,
        message: "NewsAPI returned an invalid payload.",
        rawNewsApiResponse: payload,
      });
      return;
    }

    const rawArticles = payload.articles;
    const normalizedArticles = normalizeNewsArticles(
      rawArticles,
      dateRange.from,
      dateRange.to,
      term,
    );

    res.json({
      term,
      query,
      endpointPath: "/api/recalls/news/debug",
      dateRange,
      upstreamStatus: response.status,
      rawTotalResults:
        typeof payload.totalResults === "number" ? payload.totalResults : null,
      rawArticleCount: rawArticles.length,
      normalizedArticleCount: normalizedArticles.length,
      rawNewsApiResponse: payload,
      normalizedArticles,
    });
  } catch (error) {
    logger.warn(
      {
        term,
        query,
        upstreamError:
          error instanceof Error ? error.message : "Unknown upstream error",
      },
      "NewsAPI debug request failed",
    );
    res.status(502).json({
      term,
      query,
      message: "NewsAPI debug request failed.",
    });
  }
});

export default router;