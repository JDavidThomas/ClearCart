---
name: NewsAPI recall mentions
description: Keep recent news mentions distinct from official FDA recall results and searches focused.
---

NewsAPI is an intentional, separate “Recent News Mentions” feature, not an official recall-data source. The user considers it important because it may surface recent recall reports that openFDA misses, especially for meat, poultry, and eggs and announcements from the past one to two weeks. Keep articles in their own card above the FDA recall results, label them as news rather than official FDA data, and omit the card when the NewsAPI request fails.

NewsAPI's broad full-text search for a product plus "recall" returned unrelated articles even when both terms were marked required. Restrict searches to `title,description` as well as requiring both terms; live checks produced substantially more relevant recall headlines.

**Why:** The user explicitly chose to preserve this layer after removing FSIS fetching because it helps catch recent or otherwise missed announcements. Clear separation prevents articles from being mistaken for official FDA results, while focused search terms reduce distracting noise.

**How to apply:** Keep NewsAPI out of official recall result cards and source claims. When changing its query logic, require product and recall terms, restrict search to titles and descriptions, and validate with meat, poultry, and egg terms.