---
name: Expo static build port conflict
description: Workspace-specific conflict between the Expo static build script and the mockup preview server.
---

The Expo static build script starts a second Metro server on port 8081 and can fail in non-interactive mode when the mockup preview server already owns that port.

**Why:** The build script asks whether Expo should move to another port, but non-interactive execution cannot answer, so the build reports a Metro timeout even when the managed Expo workflow is healthy.

**How to apply:** Prefer the managed Expo workflow and its bundle/log output for normal runtime verification. If a static build is required, first free the port conflict through the workflow controls rather than treating the timeout as an application-code failure.