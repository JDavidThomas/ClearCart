---
name: openFDA direct mobile search
description: Why direct Expo recall searches intentionally bundle the stored openFDA key.
---

The mobile client calls the openFDA food and drug enforcement endpoints directly. The stored `OPENFDA_API_KEY` secret is mapped to `EXPO_PUBLIC_OPENFDA_API_KEY` only while Expo bundles the app, so the API key is intentionally visible to app users.

**Why:** openFDA is a free public API with a documented 120,000-request daily limit, and direct calls remove the unstable Replit API-server URL from the primary recall search path. The key is treated as a public rate-limit credential, not a private server secret.

**How to apply:** Keep `OPENFDA_API_KEY` in Replit Secrets and map it to `EXPO_PUBLIC_OPENFDA_API_KEY` only in the Expo dev/static-build environment. Never print the value. Keep the API server available for Gemini, Supabase, and future USDA proxy work.