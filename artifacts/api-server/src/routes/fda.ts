import {
  GetFdaRecallsQueryParams,
  GetFdaRecallsResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

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
  logger.info(
    { url: safeRequestUrl },
    "Requesting OpenFDA URL",
  );

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(OPENFDA_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FdaUnreachableError(error);
  }

  if (response.status === 404) return [];
  if (!response.ok) throw new FdaResponseError(response.status);

  let payload: OpenFdaResponse;
  try {
    payload = (await response.json()) as OpenFdaResponse;
  } catch {
    throw new FdaResponseError(response.status);
  }
  return payload.results ?? [];
}

router.get("/recalls/fda", async (req, res) => {
  const parsed = GetFdaRecallsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "A recall search query is required." });
    return;
  }

  const { search, limit } = parsed.data;
  const apiKeyConfigured = Boolean(process.env.OPENFDA_API_KEY?.trim());
  logger.info({ apiKeyConfigured, limit, search }, "Searching OpenFDA through server proxy");

  try {
    const results = await Promise.all(
      OPENFDA_ENDPOINTS.map((endpoint) => searchEndpoint(endpoint, search, limit)),
    );
    const seen = new Set<string>();
    const normalizedResults = results
      .flat()
      .map(normalizeRecord)
      .filter((record) => {
        const key = record.recallNumber ?? [
          record.productDescription,
          record.recallingFirm,
          record.recallDate,
        ].join("|");
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
        message: "FDA API configuration is missing on the server.",
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