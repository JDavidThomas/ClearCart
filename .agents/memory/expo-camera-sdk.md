---
name: Expo Camera SDK alignment
description: The Expo Camera package version that matches this project's Expo SDK.
---

This project uses Expo SDK 57, and the compatible camera package available in the workspace registry is `expo-camera` 57.0.5.

**Why:** The registry does not provide every patch version suggested by generic Expo install guidance; requesting an unavailable patch blocks dependency installation.

**How to apply:** Keep future camera-related changes on the SDK 57 package line and run the app-local Expo dependency check after native package changes.