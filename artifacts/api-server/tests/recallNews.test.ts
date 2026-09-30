import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGNewsQuery,
  getNewsDateRange,
  normalizeGNewsArticles,
  normalizeNewsSearchTerm,
} from "../src/lib/recallNews.ts";

test("GNews search quotes multiword product names and asks for recall mentions", () => {
  assert.equal(buildGNewsQuery("banana"), "banana recall");
  assert.equal(buildGNewsQuery("baby spinach"), '"baby spinach" recall');
  assert.equal(normalizeNewsSearchTerm("  café—style  eggs! "), "cafe style eggs");
});

test("GNews date window is exactly the rolling previous 14 days", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  assert.deepEqual(getNewsDateRange(now), {
    from: "2026-09-16T12:00:00.000Z",
    to: "2026-09-30T12:00:00.000Z",
  });
});

test("news normalization filters out-of-range or unsafe articles and sorts newest first", () => {
  const from = "2026-09-16T12:00:00.000Z";
  const to = "2026-09-30T12:00:00.000Z";
  const articles = normalizeGNewsArticles(
    [
      {
        title: "Older recall article",
        url: "https://news.example/old",
        publishedAt: "2026-09-16T11:59:59.000Z",
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