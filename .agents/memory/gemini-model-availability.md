---
name: Gemini model availability
description: Live Gemini model IDs can change independently of the application code.
---

Treat a Gemini model name as an operational dependency and verify it against the live API when a vision request returns an upstream 404.

**Why:** The configured model can be retired while the API key and request contract remain valid, causing every photo check to fail with a generic upstream error.

**How to apply:** When diagnosing a vision 4xx/5xx, distinguish model availability from credentials and payload validation before changing client behavior.

Direct client-side Gemini requests can remain unresolved in the Replit web preview even when the Expo bundle confirms `EXPO_PUBLIC_GEMINI_API_KEY`; do not treat the configured banner as proof of a successful model call.

**Why:** The web preview can enter a configured model request without producing an HTTP result or usable timeout, so it cannot validate the key/model path that runs on a physical Expo device.

**How to apply:** Keep production vision requests server-side and require an observable app-side success response before switching the photo flow; validate direct client behavior on an actual Expo device when the web preview stalls.

Text probes against some current Flash models can spend a small output budget on internal reasoning and return no text even with HTTP 200. Give probes enough `maxOutputTokens` or disable thinking when the model supports it.

**Why:** A low-budget hello probe can look like an empty-response model failure even though the model and credentials are valid.

**How to apply:** Treat HTTP 200 plus `finishReason: MAX_TOKENS` and nonzero thought usage as a probe-budget issue, not model unavailability.
