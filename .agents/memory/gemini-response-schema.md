---
name: Gemini response schema compatibility
description: Direct Gemini API response-schema limitation affecting the mobile photo scanner.
---

The direct Gemini API rejects `additionalProperties` inside `generationConfig.responseSchema` with HTTP 400 `INVALID_ARGUMENT`. Plain JSON mode using `responseMimeType: application/json` works.

**Why:** The REST response-schema type does not accept the full JSON Schema vocabulary, even though an arbitrary nutrition dictionary needs additional properties.

**How to apply:** Keep `responseMimeType: application/json`, describe the expected object and unknown-value behavior in the prompt, and parse/normalize the returned JSON client-side. If a schema is reintroduced, use only fields confirmed by a live request.