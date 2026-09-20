---
name: Supabase profile sync
description: Direct Expo Supabase profile sessions and guest fallback for the Food Recall Tracker.
---

The mobile app uses a direct `@supabase/supabase-js` client with AsyncStorage-backed Auth persistence for profile sessions. Recall checks remain available to guests if Supabase is unavailable.

**Why:** Personalized allergen alerts need a durable account, while public recall checks must continue working during auth outages.

**How to apply:** Keep the Supabase URL and anon key in `EXPO_PUBLIC_*` secrets and forward them through the Expo dev command. On auth/profile failures, enter guest mode, show a small notice, and preserve recall access.