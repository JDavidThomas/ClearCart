---
name: openFDA product matching
description: Produce and barcode searches need local product-identity checks because openFDA queries can return broad matches.
---

Treat openFDA strict-looking product description queries as an additional signal, not as a guaranteed starts-with filter. Use normalized client-side descriptions to separate literal produce products from related mentions.

Barcode scans need a stricter rule: query the full brand/product name and UPC/EAN first, locally accept only a full product-name or UPC match, and run broad keyword searches only when no active exact match exists. Keep those broad results in the collapsed “Possibly related” section.

**Why:** Live openFDA responses returned broad matches even for strict-looking queries, so relying on the query alone can place another product’s recall in the primary verdict.

**How to apply:** Keep direct product matching and related-mention grouping in the app’s relevance layer. Generic text searches may use their existing relevance behavior; barcode searches must verify exact identity before any broad fallback.