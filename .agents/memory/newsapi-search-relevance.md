---
name: NewsAPI recall mentions
description: Keep recent news mentions distinct from official FDA recall results and searches focused.
---

NewsAPI is an intentional, separate “Recent News & Updates” feature, not an official recall-data source. It may surface recent recall reports that openFDA misses, especially for meat, poultry, and eggs. Keep the clearly labeled panel after official FDA results and show up to three articles from the previous 30 days. The active News panel should always render a visible state: article cards, a quiet empty result, or a clear unavailable message.

In tabbed result screens, render FDA and news as mutually selected panel content, and keep Health & Diet content after the panel and outside its swipe responder. If a refresh fails but recent articles are already available, keep those articles visible and label them as not refreshed.

Treat the optional `newsUnavailable` response field as unavailable only when it is explicitly `true`; a missing field defaults to available. Log both the raw field and the computed value at the result-panel boundary.

Do not quote an entire long product name as a required exact phrase: current recall stories may mention only the brand or product category. For longer names, search a distinctive brand phrase OR a normalized product descriptor, while requiring “recall”; shorter names can use unquoted terms AND “recall”. NewsAPI can still return unrelated results even when title and description are selected, so locally require product/brand relevance and recall, outbreak, or contamination context. Keep request URLs credential-free in logs and capture raw versus normalized counts.

Keep official FDA result caching independent from news caching: empty, successful news searches normally expire after five minutes, while FDA results can remain cached for 24 hours. If an empty cached result is for a term in the recent-search list, bypass that empty news cache and query again so a newly published story is not hidden. News failures should remain retryable. Bump the news-query cache version when search semantics or the date window changes, without discarding FDA results.

**Why:** A full-phrase query missed real coverage, while NewsAPI also returned an unrelated car story for a food query despite its search settings. Separate relevance filtering and short empty-result caching prevent misleading matches or stale gaps; repeated recent searches must still bypass a cached empty result so newer coverage can appear. Returning `null` for unavailable news made the always-visible Health & Diet card look like the selected News panel; treating a missing optional flag as unavailable also hid valid articles.

**How to apply:** Keep news claims separate from official FDA findings. Filter by product context and food-safety signals, enforce the 30-day/three-article display limit, retry ordinary empty searches after five minutes, and bypass empty cache hits for a term in recent searches. Keep panel selection and swipe handlers on the panel content only; log active tab/index, which panel renders, article count, the raw availability value, and its explicit-true interpretation when debugging.