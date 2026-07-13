# Task 3 report: staff-only Google authentication

## Status

Complete. Auth.js Google OAuth now protects the staff dashboard through the
configured email allowlist, an active `staff_users` row, and both proxy and
server-side checks.

## Implemented

- Added `auth.ts` with explicit Google provider configuration, JWT/session
  normalization, fail-closed callbacks, allowlist enforcement, and safe
  `staff_users` persistence/linking for the first approved sign-in. Existing
  inactive rows are never reactivated by OAuth.
- Added the Next.js 16 `src/proxy.ts` matcher for `/dashboard/:path*` and a
  route handler at `src/app/api/auth/[...nextauth]/route.ts`.
- Added `authorizeStaff` and `requireStaff`, which require a normalized
  allowlisted email and an active database row. Dashboard layout authorization
  runs before rendering and redirects denied sessions to sign-in.
- Added the Google sign-in page, sign-out action, and an empty dashboard shell
  with Overview, Venues, Promotions, Reports, and Operations navigation.
- Added focused tests for active-staff policy and mocked Auth.js callbacks; no
  Google network calls or production credentials are used.

## Verification

All commands ran in `C:\Users\laich\Documents\fbpromomvp\.worktrees\off-peak-rescue-mvp`:

| Command | Result |
|---|---|
| `npm.cmd run test -- src/lib/auth` | PASS — 2 files, 8 tests |
| `npm.cmd run test` | PASS — 7 files, 37 tests; 1 integration file/2 tests skipped by existing test-DB guard |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` with non-production test env placeholders | PASS — Auth route, dashboard, sign-in, and Proxy compiled |

## Concerns

- A build with no environment variables fails at the existing strict `src/env.ts`
  contract; the passing build used only the test placeholders already defined
  by `vitest.config.ts`. No secrets were added to the repository.
- First approved Google sign-in bootstraps a missing `staff_users` row. An
  existing inactive row remains denied and must be reactivated through an
  explicit database/admin operation.
