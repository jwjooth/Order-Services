# AGENTS.md

## What this repo actually is
Bun + Elysia (TypeScript) order service with PostgreSQL — **not Python/FastAPI**, despite the
parent folder name `FastAPI Projects/Order-Services`. Don't add FastAPI/Python tooling.

Architecture and API reference live in `README.md` (layered design, state machine, endpoints,
env vars). This file is the "don't get this wrong" list.

## Commands
- `bun run dev` → watch `src/index.ts`, port 3000
- `bun run start` → production run
- `bun test` → bun test; unit + HTTP tests, **no database needed** (fakes)
- `bun run typecheck` → `tsc --noEmit` (the only type check; no lint/format config, no CI)
- Local DB: `docker compose up -d db` (postgres on :5432), full stack: `docker compose up --build`

## Layout (layered, service layer)
`src/domain` (entity + repository *interface*, no I/O) → `src/application` (OrderService, all
business rules) → `src/interfaces/http` (Elysia routes) → `src/infrastructure` (the only code that
knows Postgres exists). `src/shared` = config/logger/errors. `src/app.ts` wires it up,
`src/index.ts` is the process entrypoint (env → migrate → listen → signal handlers).

**Dependency rule: arrows point inward.** Domain imports nothing from the app; application depends
on the `OrderRepository` interface, never on the Postgres class. New query → new method on the
interface + service + repo, never SQL in a route.

## Gotchas that will bite you
- **`DATABASE_URL` is required** — the process exits at boot without it (`src/shared/config.ts`).
- **Use Elysia's `t`, not `@sinclair/typebox`.** Typebox 0.34 schemas fail Elysia 1.4's
  StandardSchema typing (`Property '~standard' is missing`) → `tsc` errors. `import { t } from "elysia"`.
- **Elysia 1.4 has no `.onAfter()`** — use `.onAfterResponse()`. In that hook, `request.url` is
  empty (crashes `new URL()`); use the hook's `path` argument.
- **Route params are UUID-formatted** (`t.String({ format: "uuid" })`) because Postgres casts to
  `uuid`; a non-UUID id is a 422, not a 404.
- **JSON columns need `sql.json(value)`**, not `JSON.stringify(value)::jsonb` — postgres.js treats
  a JSON-looking string param as text and the value gets double-encoded (reads back as a string).
- **Status transitions are enforced** in `src/domain/order.ts` (`canTransition`): only
  pending→confirmed→shipped, and →cancelled from pending/confirmed. Anything else → 409.
- **Status changes are guarded updates** (`UPDATE ... WHERE id = ? AND status = <status read>`).
  Never change a status with a plain `UPDATE` — two concurrent writers would both win. The
  repository returns `null` when the row changed underneath; the service turns that into 409.
  The repository port is `changeStatus(id, expectedStatus, nextStatus, updatedAt)`, not `update()`.
- **Errors**: throw `AppError` subclasses from `src/shared/errors.ts` (ValidationError 422,
  NotFoundError 404, ConflictError 409). The global `handleError` in `interfaces/http` maps them
  to `{"error":{"code","message"}}`; Elysia's own `ValidationError` → 422, unknown route → 404.
- **Response schemas are validated at runtime** — a response that doesn't match the schema throws
  an Elysia `ValidationError` with `type === "response"`, which `handleError` maps to **500**, not
  422 (a bad response is our bug). The write has already happened by then, so a 500 with a big
  validation body means the repository returned the wrong shape.
- **Env vars are validated at boot** (`src/shared/config.ts`): `DATABASE_URL` required, and
  `PORT`/`LOG_LEVEL`/`NODE_ENV` must be valid — a typo exits the process instead of silently
  defaulting.
- **Migrations run at boot** (idempotent DDL in `src/infrastructure/db/postgres.ts`) and retry 5
  times — DNS/DB may not be ready when the container starts. Don't run a separate migration step.
