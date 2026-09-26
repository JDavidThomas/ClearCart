---
name: Expo tunnel startup failures
description: Handling Ngrok errors while restarting Expo Go tunnels in this workspace.
---

An Expo restart can fail during Ngrok tunnel creation with `TypeError: Cannot read properties of undefined (reading 'body')`, before Metro announces `Tunnel ready` or prints a usable `exp.direct` URL. The Ngrok status page can show operational during this failure.

**Why:** Repeated managed restarts reproduced the startup failure without creating a new tunnel, while the status page did not indicate an outage.

**How to apply:** Only share a URL printed after `Tunnel ready` and verified with an Expo manifest request. After a small number of retries fail identically, stop restarting and report that no fresh URL was generated; do not reuse an expired URL.