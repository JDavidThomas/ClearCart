---
name: Expo DevTools launcher warning
description: Distinguish an optional React Native DevTools binary error from a failed Expo Metro workflow.
---

The Expo workflow may report that its React Native DevTools launcher cannot load `libglib-2.0.so.0` while Metro, Expo Go QR output, and the named tunnel still start successfully.

**Why:** The missing shared library belongs to the optional local DevTools launcher, not the Metro bundler or the phone runtime.

**How to apply:** Check for Metro startup and tunnel registration before treating this message as a blocker; only investigate the launcher if DevTools itself is needed.