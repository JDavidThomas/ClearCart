---
name: Supabase JWT recovery confirmation
description: On-device confirmation that startup refresh restores an existing Supabase session in Expo.
---

On October 3, 2026, the user confirmed the Expo Go Supabase diagnostic showed “connected · session found” after the startup refresh and JWT-recovery changes, and said authentication is fixed.

**Why:** This confirms runtime behavior on-device, which cannot be inferred from source code alone.

**How to apply:** Treat Supabase auth as resolved in later recall-news debugging; revisit only if new evidence shows a Supabase or PostgREST failure.