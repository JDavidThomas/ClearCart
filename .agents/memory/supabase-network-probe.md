---
name: Supabase network probe
description: Replit shell connectivity can fail independently of the Expo app when probing Supabase REST endpoints.
---

The Replit container may fail to resolve the Supabase project hostname even while the Expo web preview bundles and runs with the configured Supabase client.

**Why:** A shell-level HTTP probe returning DNS status 000 does not establish that the mobile app cannot reach Supabase; the phone and Expo runtime use a separate network path.

**How to apply:** Treat successful Expo bundling as configuration verification, and validate authenticated profile reads/writes through a real signup/login session on the target device when the container DNS probe fails.