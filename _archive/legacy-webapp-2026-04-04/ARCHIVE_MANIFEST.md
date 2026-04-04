# Legacy Web App Archive (2026-04-04)

This folder contains the archived Next.js web app from the previous project version.

## Why Archived

The project direction changed to a local Python CLI workflow with Supabase functions as backend.
The web UI is currently out of scope but preserved here for potential reuse.

## Archived Paths

- app/
- components/
- lib/auth.ts
- lib/supabase.ts
- lib/templates.ts
- next-env.d.ts
- next.config.mjs
- postcss.config.js
- tailwind.config.ts
- tsconfig.json
- tsconfig.tsbuildinfo
- package.json
- package-lock.json

## Restore Notes

From repository root, restore selected items by moving them back to root paths.

Example:

```bash
mv _archive/legacy-webapp-2026-04-04/app ./
mv _archive/legacy-webapp-2026-04-04/components ./
```

For complete restore, move all files back to their original locations listed above.
