---
name: USDA FSIS egress boundary
description: Official FSIS API and website requests are blocked from the Replit server container.
---

Requests from the Replit server container to the official FSIS recall API, RSS feed, and recalls page returned HTTP 403, including with a standard browser user agent. The same official API and RSS content were retrievable through the web-fetch service. Do not treat that service as an app runtime dependency; it is not available inside the app.

**Why:** The server-side proxy could not provide FSIS data despite the public API being healthy through an external fetch path.

**How to apply:** On native Expo, try the official FSIS API directly before the API-server proxy to avoid a known failing server request; fall back to the proxy if device access fails. Web uses the proxy because direct browser access and CORS behavior are unverified. Do not make the web-fetch service an app runtime dependency.