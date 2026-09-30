---
name: FSIS manual-source boundary
description: The app does not fetch USDA FSIS recall data and links users to the official FSIS site instead.
---

The server's FSIS API requests and tested CORS proxy paths returned persistent errors, which produced confusing unavailable states. The product decision is to remove FSIS fetching entirely, use openFDA food-enforcement data for official recall results, and link meat, poultry, and egg searches directly to https://www.fsis.usda.gov/recalls.

**Why:** Unavailable FSIS cards damaged trust, and the official FSIS website remains the reliable destination for those products.

**How to apply:** Do not reintroduce an FSIS API/proxy fetch path. Keep recall search results FDA-only and retain the direct FSIS.gov link in no-results guidance and About data sources.