import {
  GetRecallNewsQueryParams,
  GetRecallNewsResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import {
  buildGNewsQuery,
  getNewsDateRange,
  GNEWS_RESULT_LIMIT,
  normalizeGNewsArticles,
  normalizeNewsSearchTerm,
} from "../lib/recallNews";

const router: IRouter = Router();
const GNEWS_SEARCH_URL = "https://gnews.io/api/v4/search";
const GNEWS_REQUEST_TIMEOUT_MS = 8_000;

interface GNewsResponse {
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
  const apiKey = process.env.GNEWS_API_KEY?.trim();
  const emptyResponse = (unavailable: boolean) =>
    GetRecallNewsResponse.parse({
      articles: [],
      unavailable,
      dateRange,
    });

  if (!apiKey) {
    logger.warn(
      { term, dateRange, unavailable: true },
      "GNews skipped because its server-side API key is not configured",
    );
    res.json(emptyResponse(true));
    return;
  }

  const query = buildGNewsQuery(term);
  const params = new URLSearchParams({
    q: query,
    lang: "en",
    country: "us",
    from: dateRange.from,
    to: dateRange.to,
    sortby: "publishedAt",
    max: String(GNEWS_RESULT_LIMIT),
    apikey: apiKey,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    GNEWS_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${GNEWS_SEARCH_URL}?${params.toString()}`, {
      headers: { accept: "application/json" },
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
        "GNews search was unavailable",
      );
      res.json(emptyResponse(true));
      return;
    }

    const payload = (await response.json()) as GNewsResponse;
    if (!isRecord(payload) || !Array.isArray(payload.articles)) {
      logger.warn(
        { term, query, dateRange, unavailable: true },
        "GNews returned an invalid search payload",
      );
      res.json(emptyResponse(true));
      return;
    }
    const articles = normalizeGNewsArticles(
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
      "GNews recent recall search completed",
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
      "GNews request failed; continuing without news mentions",
    );
    res.json(emptyResponse(true));
  } finally {
    clearTimeout(timeoutId);
  }
});

export default router;