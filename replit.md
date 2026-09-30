# Food Recall Tracker

A cross-platform Expo app for searching current food recall records before buying, cooking, or serving packaged food.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/food-recall-tracker run dev` — run the Expo mobile preview
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret for higher openFDA rate limits: `OPENFDA_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/food-recall-tracker/app/(tabs)/index.tsx` — Home search screen
- `artifacts/food-recall-tracker/services/recallApi.ts` — openFDA search and AsyncStorage cache
- `artifacts/food-recall-tracker/components/RecallCard.tsx` — recall result presentation
- `artifacts/food-recall-tracker/constants/colors.ts` — food-safety palette

## Architecture decisions

- The first mobile build is frontend-only and stores recent search results with AsyncStorage.
- openFDA results are filtered to exclude completed or terminated records before display.
- Search failures fall back to a saved result for the same term; cached results are labeled in the UI.

## Product

- Home search queries the public openFDA food enforcement API and presents active recall details.
- Scan is currently a clearly labeled placeholder for the next barcode/photo checkpoint.
- About identifies openFDA as the FDA recall data source and links directly to FSIS.gov for meat, poultry, and egg recalls.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
