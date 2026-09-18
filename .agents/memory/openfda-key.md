---
name: openFDA API key handling
description: Why the first mobile build does not bundle the stored API key into the Expo client.
---

The mobile client currently calls the public openFDA endpoint without bundling `OPENFDA_API_KEY`; the secret is stored for a future server-side proxy or rate-limit upgrade.

**Why:** Embedding a private key in an Expo bundle would expose it to every app user. The unauthenticated endpoint is sufficient for the initial search flow.

**How to apply:** If the key is needed in a later feature, proxy openFDA requests through a server route that reads the secret rather than changing the mobile bundle to expose it.