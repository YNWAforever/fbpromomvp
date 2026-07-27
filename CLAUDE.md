# Off-peak rescue engine

Detects sustained quiet periods at venues (BestTime), gets staff to approve grounded
promotion copy, broadcasts it via WozTell, and reports weekly redemption results.
n8n drives the hourly monitor and weekly report jobs over signed HTTP callbacks.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Drizzle ORM + Neon Postgres ·
Auth.js v5 (Google) · Zod 4 · Luxon · Tailwind 4 · Vitest + Playwright

## Architecture — dependencies point inward

```
src/domain/       Pure policy. No I/O, no imports from other layers.
src/application/  Orchestration. Takes a db executor + provider ports as arguments.
src/db/           Drizzle schema + repositories (one module per aggregate).
src/integrations/ Provider clients (besttime, woztell, opencode-go) + fakes/.
src/app/          Next.js routes. Auth, parse, delegate — no business logic.
```

Keep decision logic in `domain/` and pure. `application/` services receive their
dependencies (`db`, `provider`, repository overrides) as input so they test without
a database or network. Routes should stay thin.

## Rules that matter here

- **Env**: read only from `@/env` (Zod-validated). Never `process.env` directly — the
  one deliberate exception is `src/testing/test-runtime.ts`, which builds the key name
  at runtime to defeat Next's build-time inlining.
- **Secrets**: never add real BestTime/WozTell/OpenCode Go credentials to CI or tests.
  Unit and E2E suites use `src/integrations/fakes/`.
- **Errors at boundaries**: routes return generic messages
  (`NextResponse.json({ error }, { status })`). Never leak provider or database detail
  to a caller. Domain/application code throws typed errors
  (`StaffAccessDeniedError`, `JobInProgressError`).
- **Idempotency**: jobs, triggers, and audit events all carry an idempotency key.
  Preserve it when adding write paths — replays must be safe.
- **Time**: Luxon, venue-local, default `Asia/Hong_Kong`. Derive keys from local hour.
- **Money/claims**: promotion copy must be grounded against approved `OfferFacts` via
  `domain/copy/validate.ts`. Unapproved price or percentage claims are rejected.

## Auth model

Three independent mechanisms — do not collapse them:

| Surface | Gate |
|---|---|
| `/dashboard/*` | `proxy.ts` middleware **and** `requireStaff()` in the layout/page/action |
| `/api/jobs/*` | HMAC-SHA256 over `` `${timestamp}.${rawBody}` ``, 300s skew window |
| `/api/webhooks/woztell` | Bearer token, hashed + `timingSafeEqual` |
| `/redeem/*`, `/reports/*`, `/approve/*` | Scoped HMAC token (version + scope + expiry) |

`requireStaff()` applies two gates: the `ADMIN_EMAILS` allowlist *and* an active
`staff_users` row. Call it at the start of every protected server operation — do not
rely on the middleware alone.

## Commands

```bash
npm run dev            # dev server
npm run test           # vitest, colocated *.test.ts
npm run test:integration  # *.integration.test.ts — needs a real Postgres, see below
npm run test:e2e       # playwright, tests/e2e/*.spec.ts
npm run typecheck      # tsc --noEmit
npm run lint
npm run build
npm run db:generate    # drizzle-kit generate, after editing src/db/schema.ts
npm run db:migrate
```

CI runs test → typecheck → lint → build → e2e, plus a separate `integration` job.
All must pass.

### Running integration tests locally

`@neondatabase/serverless` speaks Postgres over a WebSocket, so a plain Postgres
container is unreachable without a proxy — `drizzle-kit migrate` will hang against
one. Apply the committed SQL directly and point the driver at a wsproxy:

```bash
docker network create opr-net
docker run -d --name opr-pg --network opr-net -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=off_peak_rescue_test -p 55432:5432 postgres:16
docker run -d --name opr-wsproxy --network opr-net -e APPEND_PORT="opr-pg:5432" \
  -e ALLOW_ADDR_REGEX=".*" -p 5480:80 ghcr.io/neondatabase/wsproxy:latest

for f in drizzle/*.sql; do
  docker exec -i opr-pg psql -v ON_ERROR_STOP=1 -q -U test -d off_peak_rescue_test < "$f"
done

TEST_DATABASE_URL=postgresql://test:test@localhost:55432/off_peak_rescue_test \
  NEON_WS_PROXY=localhost:5480/v1 npm run test:integration
```

### Dependency updates

Do **not** run `npm audit fix --force` here — npm cannot find a forward fix for the
`next` advisory chain and proposes `next@9.3.3`, downgrading the framework by seven
majors. Bump `next` deliberately and pin it exactly.

`npm audit` is clean. Keeping it that way depends on the `overrides` block in
`package.json`, which carries four transitive fixes no direct bump reaches. Do not
drop one without re-running `npm audit`:

| Override | Why |
|---|---|
| `postcss`, `sharp` | Pulled in by Next; no direct bump reaches them. |
| `minimatch: ^10.2.5` | ESLint reaches `minimatch@3`, whose `brace-expansion@1` has a DoS advisory. minimatch 10.1.1+ dropped that dependency entirely. Do **not** instead override `brace-expansion` — its only patched release (5.0.8) switched to a named export, and `minimatch@3` then dies with `expand is not a function`. |
| `esbuild` scoped to `@esbuild-kit/core-utils` | A deprecated package drizzle-kit still depends on, pinning esbuild at 0.18. Verify `npm run db:generate` after touching this. |

After changing any override, confirm ESLint still *inspects* files rather than silently
matching none — `npx eslint --format json` should report ~149 files, not 0.

ESLint itself is held at 9.x: `eslint-plugin-react` (bundled inside `eslint-config-next`)
peers at `^9.7` and calls a context API removed in ESLint 10, crashing on rule load.
That is now a version pin only, not a security gap. Revisit when `eslint-config-next`
ships ESLint 10 support.

## Conventions

- Files kebab-case; tests colocated as `<name>.test.ts` beside the source.
- Path alias `@/` → `src/`. Note `auth.ts` sits at the repo root, imported by relative path.
- Conventional commits (`feat:`, `fix:`, `ci:`, `docs:`, `test:`), imperative and lowercase.
- Schema changes go in `src/db/schema.ts`, then generate a migration — never hand-edit
  files in `drizzle/`. The schema leans on composite foreign keys and CHECK constraints
  to enforce venue consistency and time windows; preserve them.
