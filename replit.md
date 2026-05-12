# Naam Jaap Sewa

A devotional platform for Sri Khatu Shyam Ji naam jaap sewa — devotees chant daily, contribute to patron sankalps, and earn dakshina.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/naam-jaap run dev` — run the frontend (port 23978)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session signing key

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind v4, shadcn/ui, wouter, TanStack Query, framer-motion
- API: Express 5 + OpenAPI spec (contract-first), Orval codegen
- Auth: Replit OIDC + local email/password (bcrypt + session table)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Email: Nodemailer (Gmail SMTP via `SMTP_USER`/`SMTP_PASS` env vars)
- Build: esbuild (CJS bundle for API server)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth for all API contracts
- `lib/api-client-react/` — generated React Query hooks (from Orval)
- `lib/api-zod/` — generated Zod schemas (from Orval)
- `lib/db/src/schema/` — Drizzle ORM tables (auth, devotee, patron, settings)
- `lib/replit-auth-web/` — React auth context/provider using the session API
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/api-server/src/lib/auth.ts` — OIDC + local session management
- `artifacts/naam-jaap/src/pages/` — all 19 frontend pages
- `artifacts/naam-jaap/src/components/` — layout, auth-guards, shadcn/ui components
- `artifacts/naam-jaap/src/lib/language-context.tsx` — EN/HI i18n context

## Architecture decisions

- **Contract-first API**: OpenAPI spec → Orval codegen → typed hooks and Zod schemas. Never edit generated files.
- **Single active session per user**: On login, all other sessions for that user are deleted (enforced in `createSession`).
- **Auth guards cascade**: `RequireAuth → RequireProfileAndApproval → RequireSankalp → RequireAdmin`.
- **Patron sankalp system**: Admins create sankalps for yajamanas; bhakts contribute jaap counts daily; earnings tracked per-bhakt.
- **Robots.txt is dynamic**: Controlled via `app_settings` table key `search_engine_indexing`.

## Product

- **Landing**: Email/password login & registration, Replit OIDC login
- **Onboarding**: New devotee profile form (name, gotra, city, state, UPI)
- **Jaap**: Daily naam chanting counter with timestamp tracking and anti-cheat detection
- **Dashboard**: Personal stats — streak, daily count, earnings
- **Leaderboard**: Top chanters by day/week/all-time
- **Wallet**: Earnings summary + payout request via UPI
- **Sankalp Board**: Active and completed patron sankalps with progress bars
- **Admin Panel**: Approve devotees, manage mantras, yajamanas, sankalps, process payouts

## User preferences

- Language defaults to Hindi (`hi`), toggle available in sidebar
- Dark/light theme toggle persisted to localStorage

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after editing schema files
- `REPL_ID` env var is required for OIDC — Replit sets it automatically in dev
- SMTP vars (`SMTP_USER`, `SMTP_PASS`) are optional; without them, reset links are logged instead of emailed

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `lib/api-spec/openapi.yaml` for the full API contract
