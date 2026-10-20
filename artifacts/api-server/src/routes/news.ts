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
  type RecallNewsProductContext,
} from "../lib/recallNews";

const router: IRouter = Router();
const NEWS_API_SEARCH_URL = "https://newsapi.org/v2/everything";
const NEWS_API_REQUEST_TIMEOUT_MS = 8_000;
const NEWS_API_FETCH_PAGE_SIZE = 50;

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
  productContext?: RecallNewsProductContext,
) {
  const query = buildNewsQuery(term, productContext);
  const params = new URLSearchParams({
    q: query,
    searchIn: "title,description",
    from: dateRange.from,
    to: dateRange.to,
    language: "en",
    sortBy: "publishedAt",
    pageSize: String(NEWS_API_FETCH_PAGE_SIZE),
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
  const authorizationScheme =
    authorizationHeader?.trim().split(/\s+/, 1)[0] ?? null;
  logger.info(
    {
      method: req.method,
      requestPath: req.originalUrl,
      searchTerm: typeof req.query.term === "string" ? req.query.term : null,
      brand: typeof req.query.brand === "string" ? req.query.brand : null,
      productName:
        typeof req.query.productName === "string" ? req.query.productName : null,
      headers: {
        host: req.get("host") ?? null,
        userAgent: req.get("user-agent") ?? null,
        accept: req.get("accept") ?? null,
        contentType: req.get("content-type") ?? null,
        authorization: authorizationHeader
          ? {
              present: true,
              scheme: authorizationScheme,
              value: "[REDACTED]",
            }
          : { present: false, scheme: null, value: null },
      },
    },
    "Recall news route request received",
  );
  const logResponseSummary = (
    statusCode: number,
    summary: {
      articleCount?: number;
      rawArticleCount?: number;
      unavailable?: boolean;
      dateRange?: ReturnType<typeof getNewsDateRange>;
    } = {},
  ) => {
    logger.info(
      {
        method: req.method,
        endpointPath: req.path,
        statusCode,
        ...summary,
      },
      "Recall news route response sent",
    );
  };

  const parsed = GetRecallNewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    logResponseSummary(400);
    res.status(400).json({ message: "A product search term is required." });
    return;
  }

  const term = normalizeNewsSearchTerm(parsed.data.term);
  if (!term) {
    logResponseSummary(400);
    res.status(400).json({ message: "A product search term is required." });
    return;
  }

  const productContext: RecallNewsProductContext = {
    brand: parsed.data.brand
      ? normalizeNewsSearchTerm(parsed.data.brand)
      : undefined,
    productName: parsed.data.productName
      ? normalizeNewsSearchTerm(parsed.data.productName)
      : undefined,
  };
  const dateRange = getNewsDateRange();
  const apiKey = process.env.NEWSAPI_API_KEY?.trim();
  const emptyResponse = (unavailable: boolean) =>
    GetRecallNewsResponse.parse({
      articles: [],
      unavailable,
      dateRange,
    });
  const sendEmptyResponse = (unavailable: boolean) => {
    const payload = emptyResponse(unavailable);
    logResponseSummary(200, {
      articleCount: payload.articles.length,
      rawArticleCount: 0,
      unavailable,
      dateRange,
    });
    res.json(payload);
  };

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
    sendEmptyResponse(true);
    return;
  }

  if (!apiKey) {
    logger.warn(
      { term, dateRange, unavailable: true },
      "NewsAPI skipped because its server-side API key is not configured",
    );
    sendEmptyResponse(true);
    return;
  }

  const { query, requestUrl } = createNewsApiRequest(term, dateRange, productContext);

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
          upstreamContentType: response.headers.get("content-type"),
          responseBodyLength: responseBody.length,
          unavailable: true,
        },
        "NewsAPI search was unavailable",
      );
      sendEmptyResponse(true);
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
          upstreamContentType: response.headers.get("content-type"),
          responseBodyLength: responseBody.length,
          unavailable: true,
        },
        "NewsAPI returned an unreadable response",
      );
      sendEmptyResponse(true);
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
          upstreamContentType: response.headers.get("content-type"),
          responseBodyLength: responseBody.length,
          unavailable: true,
        },
        "NewsAPI returned an invalid search payload",
      );
      sendEmptyResponse(true);
      return;
    }
    const rawArticles = payload.articles;
    const articles = normalizeNewsArticles(
      rawArticles,
      dateRange.from,
      dateRange.to,
      term,
      productContext,
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
        unavailable: false,
      },
      "NewsAPI response received and normalized",
    );
    const normalizedResponse = GetRecallNewsResponse.parse({
      articles,
      unavailable: false,
      dateRange,
    });
    logResponseSummary(200, {
      articleCount: normalizedResponse.articles.length,
      rawArticleCount: rawArticles.length,
      unavailable: normalizedResponse.unavailable,
      dateRange,
    });
    res.json(normalizedResponse);
  } catch (error) {
    logger.warn(
      {
        term,
        query,
        requestUrl,
        dateRange,
        errorType: error instanceof Error ? error.name : typeof error,
        unavailable: true,
      },
      "NewsAPI request failed; continuing without news mentions",
    );
    sendEmptyResponse(true);
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

  const productContext: RecallNewsProductContext = {
    brand: parsed.data.brand
      ? normalizeNewsSearchTerm(parsed.data.brand)
      : undefined,
    productName: parsed.data.productName
      ? normalizeNewsSearchTerm(parsed.data.productName)
      : undefined,
  };
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
  const { query, requestUrl } = createNewsApiRequest(term, dateRange, productContext);

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
      productContext,
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