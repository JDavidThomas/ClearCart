---
name: NewsAPI recall mentions
description: Keep recent news mentions distinct from official FDA recall results and searches focused.
---

NewsAPI is an intentional, separate “Recent News Mentions” feature, not an official recall-data source. The user considers it important because it may surface recent recall reports that openFDA misses, especially for meat, poultry, and eggs and announcements from the past one to two weeks. Keep articles in their own card above the FDA recall results, label them as news rather than official FDA data, and omit the card when the NewsAPI request fails.

Do not quote an entire long product name as a required exact phrase: current recall stories may mention only the brand or product category. For longer names, search a distinctive brand phrase OR a normalized product descriptor, while requiring “recall”; shorter names can use unquoted terms AND “recall”. Continue restricting results to title and description. Keep request URLs credential-free in logs, and capture raw versus normalized article counts to distinguish empty searches from parsing filters.

Older app cache entries can preserve an empty news search for 24 hours even after the query logic improves. Mark news-query cache versions so old entries re-fetch NewsAPI once without discarding cached official FDA results.

**Why:** The user explicitly chose to preserve this layer after removing FSIS fetching because it helps catch recent or otherwise missed announcements. A full-phrase query missed real coverage, while broad but separate terms surfaced it. Versioned news-cache invalidation prevents stale empty results from hiding the fix.

**How to apply:** Keep NewsAPI out of official recall result cards and source claims. When changing query semantics, retain recall-focused title/description searches and bump the news cache version so cached empty results are retried.