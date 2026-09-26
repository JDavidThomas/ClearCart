import {
  GetFdaRecallsQueryParams,
  GetFdaRecallsResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { searchFdaRecallNoticeIndex } from "../lib/fdaRecallNotices";

const router: IRouter = Router();
const OPENFDA_ENDPOINTS = [
  "https://api.fda.gov/food/enforcement.json",
  "https://api.fda.gov/drug/enforcement.json",
];
const DEFAULT_FDA_NOTICES_URL =
  "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts";
const OPENFDA_REQUEST_TIMEOUT_MS = 15_000;

interface OpenFdaRecord {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  report_date?: string;
  classification?: string;
  status?: string;
  url?: string;
}

interface OpenFdaResponse {
  results?: OpenFdaRecord[];
}

class FdaConfigurationError extends Error {
  readonly code = "FDA_API_CONFIGURATION_ERROR";
}

class FdaUnreachableError extends Error {
  readonly code = "FDA_API_UNREACHABLE";

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "OpenFDA request failed");
  }
}

class FdaResponseError extends Error {
  readonly code = "FDA_API_ERROR";
  readonly status: number;

  constructor(status: number) {
    super(`OpenFDA returned HTTP ${status}`);
    this.status = status;
  }
}

function valueOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function redactOpenFdaValue(value: string, apiKey: string) {
  return value
    .split(apiKey)
    .join("[REDACTED]")
    .split(encodeURIComponent(apiKey))
    .join("[REDACTED]")
    .replace(/([?&]api_key=)[^&\s]*/gi, "$1[REDACTED]");
}

function normalizeRecord(record: OpenFdaRecord) {
  return {
    recallNumber: record.recall_number?.trim() || undefined,
    productDescription: valueOrFallback(
      record.product_description,
      "Product description unavailable",
    ),
    reasonForRecall: valueOrFallback(record.reason_for_recall, "Reason not provided"),
    recallingFirm: valueOrFallback(record.recalling_firm, "Recalling firm not provided"),
    recallDate: valueOrFallback(record.report_date, "Date not provided"),
    classification: valueOrFallback(record.classification, "Classification not provided"),
    status: record.status?.trim() || undefined,
    officialUrl: valueOrFallback(record.url, DEFAULT_FDA_NOTICES_URL),
  };
}

async function searchEndpoint(endpoint: string, search: string, limit: number) {
  const params = new URLSearchParams({
    search,
    limit: String(limit),
    sort: "report_date:desc",
  });
  const apiKey = process.env.OPENFDA_API_KEY?.trim();
  if (!apiKey) {
    throw new FdaConfigurationError("OPENFDA_API_KEY is not configured");
  }
  params.set("api_key", apiKey);

  const encodedParams = params.toString().replace(/\*/g, "%2A");
  const requestUrl = `${endpoint}?${encodedParams}`;
  const safeRequestUrl = requestUrl.replace(
    /([?&]api_key=)[^&]*/,
    "$1%5BREDACTED%5D",
  );
  logger.info({
    url: safeRequestUrl,
    apiKeyConfigured: Boolean(apiKey),
    apiKeyIncluded: params.has("api_key"),
  }, "Requesting OpenFDA URL");

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(OPENFDA_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FdaUnreachableError(error);
  }

  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch {
    logger.error(
      { url: safeRequestUrl, status: response.status },
      "OpenFDA response body could not be read",
    );
    throw new FdaResponseError(response.status);
  }
  const safeResponseBody = redactOpenFdaValue(responseBody, apiKey);

  if (response.status === 404) {
    logger.info(
      { url: safeRequestUrl, status: response.status, body: safeResponseBody },
      "OpenFDA returned no matches",
    );
    return [];
  }
  if (!response.ok) {
    logger.error(
      { url: safeRequestUrl, status: response.status, body: safeResponseBody },
      "OpenFDA returned an error response",
    );
    throw new FdaResponseError(response.status);
  }

  let payload: OpenFdaResponse;
  try {
    payload = JSON.parse(responseBody) as OpenFdaResponse;
  } catch {
    logger.error(
      { url: safeRequestUrl, status: response.status, body: safeResponseBody },
      "OpenFDA returned an unreadable response body",
    );
    throw new FdaResponseError(response.status);
  }
  logger.info(
    {
      url: safeRequestUrl,
      status: response.status,
      resultCount: payload.results?.length ?? 0,
    },
    "OpenFDA response received",
  );
  return payload.results ?? [];
}

async function searchOpenFdaSources(search: string, limit: number) {
  const responses = await Promise.allSettled(
    OPENFDA_ENDPOINTS.map((endpoint) => searchEndpoint(endpoint, search, limit)),
  );
  const successfulResults = responses.filter(
    (result): result is PromiseFulfilledResult<OpenFdaRecord[]> =>
      result.status === "fulfilled",
  );
  if (successfulResults.length > 0) {
    return successfulResults.flatMap((result) => result.value);
  }

  throw (
    responses.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )?.reason ?? new Error("OpenFDA returned no results.")
  );
}

router.get("/recalls/fda", async (req, res) => {
  const parsed = GetFdaRecallsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "A recall search query is required." });
    return;
  }

  const { search, limit } = parsed.data;
  const apiKeyConfigured = Boolean(process.env.OPENFDA_API_KEY?.trim());
  logger.info(
    { apiKeyConfigured, limit, search },
    "Searching OpenFDA and FDA recall notices through server proxy",
  );

  try {
    const [openFdaResult, noticeResult] = await Promise.allSettled([
      searchOpenFdaSources(search, limit),
      searchFdaRecallNoticeIndex(search),
    ]);
    if (openFdaResult.status === "rejected" && noticeResult.status === "rejected") {
      throw openFdaResult.reason;
    }
    if (openFdaResult.status === "rejected") {
      logger.warn({ err: openFdaResult.reason, search }, "OpenFDA search failed; using FDA notices");
    }
    if (noticeResult.status === "rejected") {
      logger.warn({ err: noticeResult.reason, search }, "FDA notice search failed; using OpenFDA");
    }

    const results = [
      ...(openFdaResult.status === "fulfilled" ? openFdaResult.value.map(normalizeRecord) : []),
      ...(noticeResult.status === "fulfilled" ? noticeResult.value : []),
    ];
    const seen = new Set<string>();
    const normalizedResults = results.filter((record) => {
      const key =
        record.recallNumber ??
        [
          record.productDescription,
          record.recallingFirm,
          record.recallDate,
        ]
          .join("|")
          .toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const response = GetFdaRecallsResponse.parse({ results: normalizedResults });
    res.json(response);
  } catch (error) {
    if (error instanceof FdaConfigurationError) {
      logger.error({ err: error, search }, "OpenFDA API configuration is missing");
      res.status(500).json({
        code: error.code,
        message: "FDA API configuration is missing and the official FDA notice search is unavailable.",
      });
      return;
    }

    if (error instanceof FdaUnreachableError) {
      logger.error({ err: error, search }, "FDA API is unreachable");
      res.status(502).json({
        code: error.code,
        message: "FDA API is unreachable right now. Please try again.",
      });
      return;
    }

    if (error instanceof FdaResponseError) {
      logger.error({ err: error, search, upstreamStatus: error.status }, "FDA API returned an error");
      res.status(502).json({
        code: error.code,
        message: `FDA API returned an error (HTTP ${error.status}). Please try again.`,
      });
      return;
    }

    logger.error({ err: error, search }, "FDA API response could not be read");
    res.status(502).json({
      code: "FDA_API_ERROR",
      message: "FDA API returned an unreadable response. Please try again.",
    });
  }
});

export default router;