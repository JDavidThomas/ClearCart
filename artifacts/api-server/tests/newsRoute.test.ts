import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { build } from "esbuild";
import test from "node:test";

const artifactDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

interface HttpResponse {
  statusCode: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function get(
  server: http.Server,
  requestPath: string,
  headers?: Record<string, string>,
) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return new Promise<HttpResponse>((resolve, reject) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: requestPath,
        headers,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body,
          });
        });
      },
    );
    request.on("error", reject);
  });
}

test("news route returns the same articles with browser and app-style headers without caching", async (t) => {
  const temporaryDirectory = await mkdtemp(
    path.join(artifactDirectory, ".news-route-test-"),
  );
  const bundledRoutePath = path.join(temporaryDirectory, "news-route.mjs");
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    NEWSAPI_API_KEY: process.env.NEWSAPI_API_KEY,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };
  const originalFetch = globalThis.fetch;

  process.env.NODE_ENV = "test";
  process.env.NEWSAPI_API_KEY = "test-newsapi-key";
  process.env.LOG_LEVEL = "silent";

  const mockArticle = {
    title: "E. coli outbreak linked to raw milk cheese recall",
    description: "The recall includes Sierra Nevada Graziers cheeses.",
    url: "https://news.example/recall",
    publishedAt: new Date().toISOString(),
    source: { name: "Food News" },
  };
  const mockAggregatorArticle = {
    title: "E. coli outbreak linked to raw milk cheese",
    description: "The recall includes Sierra Nevada Graziers cheeses.",
    url: "https://www.biztoc.com/article/raw-milk-cheese",
    publishedAt: new Date().toISOString(),
    source: { name: "Biztoc.com" },
  };
  const mockGreatValueBerryArticle = {
    title: "Great Value frozen berry blend recalled",
    description: "Walmart says the berry recall follows contamination concerns.",
    url: "https://news.example/great-value-berries",
    publishedAt: new Date().toISOString(),
    source: { name: "Daily News" },
  };
  const mockWalmartBerryArticle = {
    title: "Walmart berry recall affects frozen fruit",
    description: "A recall of berry mix was announced this week.",
    url: "https://news.example/walmart-berries",
    publishedAt: new Date().toISOString(),
    source: { name: "Market News" },
  };
  const mockPeanutButterArticle = {
    title: "Peanut butter recall announced after salmonella concerns",
    description: "The recall affects several peanut butter products.",
    url: "https://news.example/peanut-butter",
    publishedAt: new Date().toISOString(),
    source: { name: "Food News" },
  };
  const mockNewsApiResponse = {
    status: "ok",
    totalResults: 5,
    articles: [
      mockArticle,
      mockAggregatorArticle,
      mockGreatValueBerryArticle,
      mockWalmartBerryArticle,
      mockPeanutButterArticle,
    ],
  };
  const upstreamRequests: string[] = [];

  globalThis.fetch = async (input) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    upstreamRequests.push(requestUrl);
    assert.equal(
      new URL(requestUrl).hostname,
      "newsapi.org",
      "the test must not make requests to any live service",
    );
    return new Response(JSON.stringify(mockNewsApiResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  let server: http.Server | undefined;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (server?.listening) {
      server.close();
      await once(server, "close");
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  await build({
    entryPoints: [path.join(artifactDirectory, "src/routes/news.ts")],
    outfile: bundledRoutePath,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["express", "pino", "pino-pretty"],
  });

  const { default: newsRouter } = await import(
    pathToFileURL(bundledRoutePath).href
  );
  const app = express();
  app.use("/api", newsRouter);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const term = "Sierra Nevada Graziers Raw Milk Cheeses";
  const encodedTerm = encodeURIComponent(term);
  const productionResponse = await get(
    server,
    `/api/recalls/news?term=${encodedTerm}`,
  );
  const appStyleResponse = await get(
    server,
    `/api/recalls/news?term=${encodedTerm}`,
    {
      authorization: "Bearer ExpoGoHeaderTestOnly",
    },
  );
  const debugResponse = await get(
    server,
    `/api/recalls/news/debug?term=${encodedTerm}`,
  );
  const productSearchParams = new URLSearchParams({
    term: "Great Value Creamy Peanut Butter",
    brand: "Great Value",
    productName: "Great Value Creamy Peanut Butter",
  });
  const productResponse = await get(
    server,
    `/api/recalls/news?${productSearchParams.toString()}`,
  );
  const productDebugResponse = await get(
    server,
    `/api/recalls/news/debug?${productSearchParams.toString()}`,
  );
  const productionBody = JSON.parse(productionResponse.body);
  const appStyleBody = JSON.parse(appStyleResponse.body);
  const debugBody = JSON.parse(debugResponse.body);
  const productBody = JSON.parse(productResponse.body);
  const productDebugBody = JSON.parse(productDebugResponse.body);

  assert.equal(productionResponse.statusCode, 200);
  assert.equal(productionResponse.headers["cache-control"], "no-store");
  assert.equal(productionBody.unavailable, false);
  assert.equal(typeof productionBody.dateRange.from, "string");
  assert.equal(typeof productionBody.dateRange.to, "string");
  assert.ok(Date.parse(productionBody.dateRange.from));
  assert.ok(Date.parse(productionBody.dateRange.to));
  assert.equal(productionBody.articles.length, 1);
  assert.deepEqual(productionBody.articles[0], {
    title: mockArticle.title,
    description: mockArticle.description,
    url: mockArticle.url,
    publishedAt: mockArticle.publishedAt,
    source: mockArticle.source.name,
  });

  assert.equal(appStyleResponse.statusCode, 200);
  assert.equal(appStyleResponse.headers["cache-control"], "no-store");
  assert.equal(appStyleBody.unavailable, false);
  assert.equal(typeof appStyleBody.dateRange.from, "string");
  assert.equal(typeof appStyleBody.dateRange.to, "string");
  assert.deepEqual(appStyleBody.articles, productionBody.articles);

  assert.equal(debugResponse.statusCode, 200);
  assert.equal(debugResponse.headers["cache-control"], "no-store");
  assert.deepEqual(debugBody.normalizedArticles, productionBody.articles);
  assert.equal(debugBody.term, term);
  assert.equal(debugBody.endpointPath, "/api/recalls/news/debug");
  assert.equal(debugBody.upstreamStatus, 200);
  assert.equal(debugBody.rawTotalResults, 5);
  assert.equal(debugBody.rawArticleCount, 5);
  assert.equal(debugBody.normalizedArticleCount, 1);
  assert.deepEqual(debugBody.rawNewsApiResponse, mockNewsApiResponse);

  assert.equal(productResponse.statusCode, 200);
  assert.equal(productBody.articles.length, 1);
  assert.equal(productBody.articles[0].title, mockPeanutButterArticle.title);
  assert.equal(productDebugResponse.statusCode, 200);
  assert.equal(
    productDebugBody.query,
    '"great value creamy peanut butter" OR "great value peanut butter" OR (peanut butter AND recall)',
  );
  assert.equal(productDebugBody.rawArticleCount, 5);
  assert.equal(productDebugBody.normalizedArticleCount, 1);
  assert.equal(
    productDebugBody.normalizedArticles[0].title,
    mockPeanutButterArticle.title,
  );
  assert.equal(upstreamRequests.length, 5);
});