---
name: NewsAPI search relevance
description: Keep recall searches on NewsAPI.org focused on article-level matches.
---

NewsAPI's broad full-text search for a product plus "recall" returned unrelated articles even when both terms were marked required. Restrict searches to `title,description` as well as requiring both terms; live checks produced substantially more relevant recall headlines.

**Why:** Noisy news mentions can distract from official recall results and weaken trust in the recent-news layer.

**How to apply:** When changing this provider's query logic, keep mandatory product and recall terms and preserve the title/description search restriction; validate with meat, poultry, and egg terms.