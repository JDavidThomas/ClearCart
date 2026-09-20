---
name: openFDA produce relevance
description: Produce searches require client-side grouping because openFDA prefix queries can return the same broad matches.
---

Treat openFDA strict-looking product description queries as an additional signal, not as a guaranteed starts-with filter. Use normalized client-side descriptions to separate literal produce products from related mentions.

**Why:** Live openFDA responses returned broad matches even for a `product_description:<item>*` query, so relying on the query alone would put cookies, mixers, or other products in the primary produce verdict.

**How to apply:** Keep direct produce matching and related-mention grouping in the app’s relevance layer, rerun that grouping for cached results, and keep the related section secondary and collapsed.