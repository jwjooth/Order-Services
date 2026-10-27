# Order Services

Order microservice — **Bun + Elysia + TypeScript + PostgreSQL**. (The parent folder is named
`FastAPI Projects`, but nothing here is Python.) Database is standard **PostgreSQL**.

## Architecture — Layered, with a Service Layer

```
HTTP request
   │
┌──▼───────────────────────────────────────────────────────────────┐
│ interfaces/http        Elysia routes, request/response schemas   │  ← knows HTTP only
│                        (order.routes.ts, error mapping)          │
├──┬───────────────────────────────────────────────────────────────┘
│   │ calls use cases, never touches the DB
┌──▼───────────────────────────────────────────────────────────────┐
│ application            OrderService: create / get / list /        │  ← business rules live here
│                        changeStatus (validation, state machine)  │
├──┬───────────────────────────────────────────────────────────────┘
│   │ talks to the port
┌──▼───────────────────────────────────────────────────────────────┐
│ domain                 Order entity, status + transition rules,  │  ← no I/O, no framework
│                        OrderRepository interface (port)           │
├──┬───────────────────────────────────────────────────────────────┘
│   │ implements the port
┌──▼───────────────────────────────────────────────────────────────┐
│ infrastructure         PostgresOrderRepository, postgres.js pool, │  ← the only place that knows
│                        DDL migration at boot                      │    Postgres exists
└──────────────────────────────────────────────────────────────────┘
        shared/  config (env), logger (JSON), errors (AppError)
```

Dependency rule: **arrows point inward only.** `domain` imports nothing from the app;
`application` depends on the `OrderRepository` interface, never on the Postgres class. Swapping
Postgres for another store = write one new class in `infrastructure/repositories/` and pass it via
`buildApp({ repository })`.

### Order state machine

```
pending ──▶ confirmed ──▶ shipped
   │            │
   └────────────┴──▶ cancelled
```

`shipped` and `cancelled` are terminal. Illegal transitions → HTTP 409 (`ConflictError`).

Status changes are **guarded updates**: `UPDATE ... WHERE id = ? AND status = <status read>`, so two
concurrent writers can't both win — the loser gets 409 `order ... was modified concurrently`.

### API

| Method | Path                 | Notes                                     |
| ------ | -------------------- | ----------------------------------------- |
| POST   | `/orders`            | create → 201                              |
| GET    | `/orders/:id`        | 404 if unknown, 422 if id is not a UUID   |
| GET    | `/orders`            | `?customerId=&status=&limit=&offset=`     |
| PATCH  | `/orders/:id/status` | `{"status":"confirmed"}` → 409 if illegal |
| GET    | `/health`            | liveness — no DB touch                    |
| GET    | `/ready`             | readiness — `SELECT 1`, 503 if DB is down |

Errors are always `{"error":{"code","message","details?"}}`.

## Run locally

Ensure PostgreSQL is running locally or via Docker Compose.

```bash
bun install
bun run dev                     # http://localhost:3000
```

Full stack with local Postgres in containers: `docker compose up --build`.

## Commands

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `bun run dev`       | watch mode on `src/index.ts`                 |
| `bun run start`     | production run (no watch)                    |
| `bun run build`     | bundle to `dist/` (`bun build --target bun`) |
| `bun test`          | bun test — unit + HTTP tests, no DB needed   |
| `bun run typecheck` | `tsc --noEmit`                               |

## Config (env vars)

`DATABASE_URL` is **required** — the process exits at boot without it (e.g. `postgres://postgres:postgres@localhost:5432/orders_db`).
Others: `PORT` (3000), `HOST` (0.0.0.0), `DATABASE_SSL` (false for local, true if TLS is required), `LOG_LEVEL` (debug|info|warn|error), `NODE_ENV` (development|production|test). Invalid values fail fast.

Logs are one JSON object per line on stdout.

## Production notes

- Migrations run at boot (idempotent `CREATE TABLE IF NOT EXISTS`), with retries — a DB that is
  still starting no longer kills the process.
- `SIGTERM`/`SIGINT` → stop the HTTP server, drain the pool, exit 0 (Railway/Docker friendly).
- `/health` is the container healthcheck; `/ready` reflects DB connectivity.
- `railway.json` builds from the `Dockerfile` and points the platform healthcheck at `/health`.
  On Railway, add the Postgres plugin and set `DATABASE_URL` (+ `DATABASE_SSL=true`) as variables.
- Scaling out is safe: no local state, all state in Postgres.
