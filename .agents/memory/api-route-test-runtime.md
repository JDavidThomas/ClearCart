---
name: API route test runtime
description: Node's native TypeScript runner does not directly execute API routes with extensionless TypeScript imports and workspace source aliases.
---

For API route integration tests under Node's native TypeScript runner, bundle the route module with esbuild and load the bundle from inside the package workspace. Keep runtime dependencies such as Express external, but bundle workspace libraries whose package entry points resolve to extensionless TypeScript source.

**Why:** Native type stripping does not rewrite extensionless TypeScript imports, and workspace aliases may resolve to source files that Node cannot load directly. Bundling those local imports preserves a real route test without adding a TypeScript runtime loader.

**How to apply:** Use this approach when tests need to exercise an Express route module directly from TypeScript. Keep the temporary bundle under the package so Node can resolve its installed runtime dependencies, then remove it after the test.