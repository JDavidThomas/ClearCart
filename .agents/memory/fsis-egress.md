---
name: USDA FSIS egress boundary
description: Official FSIS API and website requests are blocked from the Replit server container.
---

Requests from the Replit server container to the official FSIS recall API, RSS feed, and recalls page returned HTTP 403, including with a standard browser user agent. The same official API and RSS content were retrievable through the web-fetch service. Do not treat that service as an app runtime dependency; it is not available inside the app.

**Why:** The server-side proxy could not provide FSIS data despite the public API being healthy through an external fetch path.

**How to apply:** Keep the generated API client as the normal path, but allow native Expo clients to fall back to a direct request to the official FSIS API. Do not assume direct browser access works; CORS behavior was not verified.