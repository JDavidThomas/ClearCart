---
name: NewsAPI recall mentions
description: Keep recent news mentions distinct from official FDA recall results and searches focused.
---

NewsAPI is an intentional, separate “Recent News & Updates” feature, not an official recall-data source. It may surface recent recall reports that openFDA misses, especially for meat, poultry, and eggs. Keep the clearly labeled panel after official FDA results and show up to three articles from the previous 30 days. The active News panel should always render a visible state: article cards, a quiet empty result, or a clear unavailable message.

In tabbed result screens, render FDA and news as mutually selected panel content, and keep Health & Diet content after the panel and outside its swipe responder. If a refresh fails but recent articles are already available, keep those articles visible and label them as not refreshed.

Do not quote an entire long product name as a required exact phrase: current recall stories may mention only the brand or product category. For longer names, search a distinctive brand phrase OR a normalized product descriptor, while requiring “recall”; shorter names can use unquoted terms AND “recall”. NewsAPI can still return unrelated results even when title and description are selected, so locally require product/brand relevance and recall, outbreak, or contamination context. Keep request URLs credential-free in logs and capture raw versus normalized counts.

Keep official FDA result caching independent from news caching: empty, successful news searches expire after five minutes, while FDA results can remain cached for 24 hours. News failures should remain retryable. Bump the news-query cache version when search semantics or the date window changes, without discarding FDA results.

**Why:** A full-phrase query missed real coverage, while NewsAPI also returned an unrelated car story for a food query despite its search settings. Separate relevance filtering and short empty-result caching prevent misleading matches or stale gaps while preserving recent USDA coverage. Returning `null` for unavailable news made the always-visible Health & Diet card look like the selected News panel.

**How to apply:** Keep news claims separate from official FDA findings. Filter by product context and food-safety signals, enforce the 30-day/three-article display limit, and retry a successful empty search after five minutes. Keep panel selection and swipe handlers on the panel content only; log active tab/index, which panel renders, article count, and source availability when debugging.