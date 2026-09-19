import { buildOpenFdaSearchQuery, cleanRecallSearchTerm } from "../../food-recall-tracker/services/recallSearch.ts";
import {
  HEALTH_RETRY_DELAYS_MS,
  getHealthRetryDelay,
  resolveApiBaseUrl,
} from "../../food-recall-tracker/services/apiConnection.ts";
import { searchFdaRecalls } from "../../food-recall-tracker/services/fdaRecalls.ts";

const BASE_URL = process.env.FDA_TEST_BASE_URL ?? "http://127.0.0.1:8080";
const LIMIT = "20";
const OPENFDA_ENDPOINTS = [
  "https://api.fda.gov/food/enforcement.json",
  "https://api.fda.gov/drug/enforcement.json",
];

const SEARCH_TERMS = [
  "bananas",
  "avocados",
  "chicken",
  "lettuce",
  "cheese",
  "banana",
  "avocado",
  "chicken",
  "lettuce",
  "cheese",
  "Dole",
  "GreenWise",
  "Taylor Farms",
  "Kroger",
  "ground beef",
  "romaine lettuce",
  "frozen berries",
  "Dole bananas",
  "GreenWise berries",
  "BANANA",
  "BaNaNa",
  "banana",
  "jalapeño",
  "jalapeno",
  "bananna",
  "avacado",
  "a",
  "ab",
  "abc",
  "banana organic frozen berries with added sugar",
];

function buildProxyUrl(query) {
  const url = new URL("/api/recalls/fda", BASE_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", LIMIT);
  return url.toString();
}

function buildOpenFdaUrl(endpoint, query) {
  const params = new URLSearchParams({
    search: query,
    limit: LIMIT,
    api_key: "[REDACTED]",
  });
  const encodedParams = params.toString().replace(/\*/g, "%2A");
  return `${endpoint}?${encodedParams}`;
}

function formatValue(value) {
  return JSON.stringify(value);
}

function runApiConnectionRegressionTest() {
  const currentApiBaseUrl = "https://current-project.riker.replit.dev";
  const staleCachedApiBaseUrl = "https://old-server-instance.riker.replit.dev";

  if (resolveApiBaseUrl(currentApiBaseUrl, staleCachedApiBaseUrl) !== currentApiBaseUrl) {
    throw new Error("Current environment API URL did not override the stale cached URL.");
  }
  if (resolveApiBaseUrl(null, staleCachedApiBaseUrl) !== staleCachedApiBaseUrl) {
    throw new Error("Cached API URL was not retained as a fallback when no current URL exists.");
  }
  if (resolveApiBaseUrl(null, null) !== null) {
    throw new Error("Missing API URLs should resolve to null.");
  }
  if (HEALTH_RETRY_DELAYS_MS.join(",") !== "500,1000,2000") {
    throw new Error("Health retry delays changed unexpectedly.");
  }
  if ([0, 1, 2].some((index) => getHealthRetryDelay(index) !== HEALTH_RETRY_DELAYS_MS[index])) {
    throw new Error("Health retry delay schedule is not applied in order.");
  }

  console.log("API connection regression test passed: current URL wins, fallback is bounded, retry delays are 500ms/1s/2s.");
}

async function runDirectFdaSearchTest() {
  const recalls = await searchFdaRecalls("banana");
  if (recalls.length === 0) {
    throw new Error("Direct openFDA banana search returned no active recalls.");
  }
  if (recalls.some((recall) => recall.source !== "FDA")) {
    throw new Error("Direct openFDA search returned a non-FDA source.");
  }
  console.log(`Direct openFDA search test passed: banana returned ${recalls.length} FDA result(s).`);
}

async function runSearch(term, index) {
  const normalizedTerm = cleanRecallSearchTerm(term);
  const query = buildOpenFdaSearchQuery(term);

  let status = "NETWORK_ERROR";
  let resultCount = 0;
  let errorMessage = "none";
  let effectiveQuery = query;
  let effectiveProxyUrl = buildProxyUrl(query);
  let effectiveOpenFdaUrls = OPENFDA_ENDPOINTS.map((endpoint) =>
    buildOpenFdaUrl(endpoint, query),
  );
  let fallbackUsed = false;

  async function requestSearch(searchQuery) {
    const response = await fetch(buildProxyUrl(searchQuery), {
      headers: { accept: "application/json" },
    });
    const payload = await response.json();
    return {
      response,
      payload,
      count: Array.isArray(payload.results) ? payload.results.length : 0,
    };
  }

  try {
    let attempt = await requestSearch(query);
    if (attempt.response.ok && attempt.count === 0) {
      const firstWord = normalizedTerm.split(" ")[0];
      const fallbackQuery = buildOpenFdaSearchQuery(firstWord);
      if (fallbackQuery && fallbackQuery !== query) {
        fallbackUsed = true;
        effectiveQuery = fallbackQuery;
        effectiveProxyUrl = buildProxyUrl(fallbackQuery);
        effectiveOpenFdaUrls = OPENFDA_ENDPOINTS.map((endpoint) =>
          buildOpenFdaUrl(endpoint, fallbackQuery),
        );
        attempt = await requestSearch(fallbackQuery);
      }
    }
    status = String(attempt.response.status);
    resultCount = attempt.count;
    errorMessage =
      typeof attempt.payload.message === "string"
        ? attempt.payload.message
        : "none";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  console.log(`[${String(index + 1).padStart(2, "0")}/${SEARCH_TERMS.length}] term=${formatValue(term)}`);
  console.log(`  normalized=${formatValue(normalizedTerm)}`);
  console.log(`  query=${formatValue(query)}`);
  console.log(`  foodUrl=${effectiveOpenFdaUrls[0]}`);
  console.log(`  drugUrl=${effectiveOpenFdaUrls[1]}`);
  console.log(`  proxyUrl=${effectiveProxyUrl}`);
  console.log(`  fallbackUsed=${fallbackUsed}`);
  if (fallbackUsed) {
    console.log(`  effectiveQuery=${formatValue(effectiveQuery)}`);
  }
  console.log(`  status=${status}`);
  console.log(`  resultsFound=${resultCount > 0} count=${resultCount}`);
  console.log(`  error=${formatValue(errorMessage)}`);
}

console.log(`FDA batch search test base URL: ${BASE_URL}`);
console.log(`Running ${SEARCH_TERMS.length} searches with limit=${LIMIT}`);
console.log("API keys are redacted from logged URLs.");
console.log("");
runApiConnectionRegressionTest();
await runDirectFdaSearchTest();
console.log("");

for (const [index, term] of SEARCH_TERMS.entries()) {
  await runSearch(term, index);
}