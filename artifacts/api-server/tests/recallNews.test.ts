import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNewsQuery,
  getNewsDateRange,
  isNewsApiAllowed,
  normalizeNewsArticles,
  normalizeNewsSearchTerm,
} from "../src/lib/recallNews.ts";

test("NewsAPI search broadens long product names instead of requiring one exact phrase", () => {
  assert.equal(buildNewsQuery("banana"), "banana AND recall");
  assert.equal(buildNewsQuery("baby spinach"), "baby spinach AND recall");
  assert.equal(
    buildNewsQuery("Sierra Nevada Graziers Raw Milk Cheeses"),
    '("sierra nevada" OR "raw milk cheese") AND recall',
  );
  assert.equal(
    buildNewsQuery("Sierra Nevada Cheese recall"),
    "sierra nevada cheese AND recall",
  );
  assert.equal(buildNewsQuery("raw milk cheese recall"), "raw milk cheese AND recall");
  assert.equal(normalizeNewsSearchTerm("  café—style  eggs! "), "cafe style eggs");
});

test("NewsAPI is limited to development and testing unless explicitly enabled elsewhere", () => {
  assert.equal(isNewsApiAllowed("development", undefined), true);
  assert.equal(isNewsApiAllowed("test", undefined), true);
  assert.equal(isNewsApiAllowed("production", undefined), false);
  assert.equal(isNewsApiAllowed("staging", undefined), false);
  assert.equal(isNewsApiAllowed(undefined, undefined), false);
  assert.equal(isNewsApiAllowed("production", "true"), true);
});

test("NewsAPI date window is exactly the rolling previous 30 days", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  assert.deepEqual(getNewsDateRange(now), {
    from: "2026-08-31T12:00:00.000Z",
    to: "2026-09-30T12:00:00.000Z",
  });
});

test("news normalization filters out-of-range or unsafe articles and sorts newest first", () => {
  const from = "2026-08-31T12:00:00.000Z";
  const to = "2026-09-30T12:00:00.000Z";
  const articles = normalizeNewsArticles(
    [
      {
        title: "Older recall article",
        url: "https://news.example/old",
        publishedAt: "2026-08-31T11:59:59.000Z",
        source: { name: "Example News" },
      },
      {
        title: "Yesterday's recall update",
        description: "A recent report.",
        url: "https://news.example/recent",
        publishedAt: "2026-09-29T08:00:00.000Z",
        source: { name: "Example News" },
      },
      {
        title: "Newest recall update",
        url: "https://news.example/newest",
        publishedAt: "2026-09-30T10:00:00.000Z",
        source: { name: "Daily Food" },
      },
      {
        title: "Future article",
        url: "https://news.example/future",
        publishedAt: "2026-10-01T00:00:00.000Z",
        source: { name: "Daily Food" },
      },
      {
        title: "Unsafe link",
        url: "javascript:alert(1)",
        publishedAt: "2026-09-30T09:00:00.000Z",
        source: { name: "Daily Food" },
      },
    ],
    from,
    to,
  );

  assert.deepEqual(
    articles.map((article) => article.title),
    ["Newest recall update", "Yesterday's recall update"],
  );
  assert.equal(articles[1].description, "A recent report.");
});

test("NewsAPI results must match the product and recall or outbreak context", () => {
  const from = "2026-08-31T12:00:00.000Z";
  const to = "2026-09-30T12:00:00.000Z";
  const articles = [
    {
      title: "E. coli outbreak linked to raw milk cheese",
      description: "A recall includes Sierra Nevada Graziers cheeses.",
      url: "https://news.example/sierra",
      publishedAt: "2026-09-27T02:00:00.000Z",
      source: { name: "Food News" },
    },
    {
      title: "Urgent recall for frozen pork sausages over plastic contamination",
      description: "Fontanini Foods recalled pork breakfast sausage.",
      url: "https://news.example/fontanini",
      publishedAt: "2026-09-28T17:00:00.000Z",
      source: { name: "Daily News" },
    },
    {
      title: "Fixing the EV error: a muscle car road test",
      description: "A review of the latest car; no food recall information.",
      url: "https://news.example/cars",
      publishedAt: "2026-09-17T07:00:00.000Z",
      source: { name: "Autocar" },
    },
  ];

  assert.equal(
    normalizeNewsArticles(articles, from, to, "Sierra Nevada Graziers Raw Milk Cheeses")[0]?.title,
    articles[0].title,
  );
  assert.equal(
    normalizeNewsArticles(articles, from, to, "Fontanini Pork Sausage")[0]?.title,
    articles[1].title,
  );
  assert.deepEqual(normalizeNewsArticles(articles, from, to, "banana"), []);
});