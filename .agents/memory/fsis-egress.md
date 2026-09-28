---
name: USDA FSIS egress boundary
description: Official FSIS API and website requests are blocked from the Replit server container.
---

Requests from the Replit server container to the official FSIS recall API, RSS feed, and recalls page returned HTTP 403, including with a standard browser user agent. The same official API and RSS content were retrievable through the web-fetch service. Public CORS proxy probes from the workspace also failed: corsproxy.io returned HTTP 403 and AllOrigins returned HTTP 522. These tests describe this environment, not every user's network.

**Why:** Server-side FSIS access and the tested public proxy paths can fail independently of external availability, so the app cannot rely on any one transport.

**How to apply:** Try native direct FSIS access, then public proxies, then the API-server proxy. Treat every path as best-effort; preserve other recall results and show an explicit unavailable state with the official FSIS link if all paths fail. Do not make the web-fetch service an app runtime dependency.