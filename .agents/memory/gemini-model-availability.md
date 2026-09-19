---
name: Gemini model availability
description: Live Gemini model IDs can change independently of the application code.
---

Treat a Gemini model name as an operational dependency and verify it against the live API when a vision request returns an upstream 404.

**Why:** The configured model can be retired while the API key and request contract remain valid, causing every photo check to fail with a generic upstream error.

**How to apply:** When diagnosing a vision 4xx/5xx, distinguish model availability from credentials and payload validation before changing client behavior.