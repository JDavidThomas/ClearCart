---
name: NewsAPI coverage boundary
description: Distinguish search-query misses from stories absent from NewsAPI's live index.
---

Broader recall queries can retrieve umbrella headlines only when NewsAPI has indexed the story; a better query cannot guarantee that a specific current USDA announcement is present. For broad category searches, retrieve more upstream results before applying the strict local relevance filter, and keep the 30-day window distinct from provider coverage.

**Why:** A live bacon query returned 30 raw results but none that passed relevance; a direct Kayem recall query returned zero. The local query was broadened, but the requested story was absent from NewsAPI's responses.

**How to apply:** For user-named current stories, inspect live raw NewsAPI titles/descriptions and the normalized result separately. Do not claim the story appears based only on a fixture or successful HTTP status; explain when upstream coverage is the remaining limit and consider another source only as a separate, explicit change.
