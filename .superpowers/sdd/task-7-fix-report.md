# Task 7 P1/P2 Fix Report

## Scope

Resolved all findings from `task-7-review-report.md` without using live provider credentials or making provider calls.

## Changes

- Added the `send_failed -> sending` transition, durable `promotions.attempts` and `promotions.provider_receipt` columns, and Drizzle migration `0004_wooden_warlock`.
- Bounded retries at three persisted attempts, atomically claim the promotion state before sending, persist provider receipts, and return the stored receipt without a second provider call after acceptance.
- Built WozTell `messages` from the approved persisted promotion body, campaign code, and validity expiry. Caller-supplied retry messages are ignored.
- Added `job_runs` claim/update handling to `/api/jobs/retry-promotion`; completed idempotency keys return the stored result and running keys do not execute a second send.
- Added `getApprovalForUpdate` row locking and `updateApprovalIfState` conditional transitions for approve, skip, edit, select, and expiry. Owner edits fail closed with `owner_edit_facts_unavailable` when approved facts are unavailable.
- Replaced webhook bearer equality with hashed `timingSafeEqual` comparison and added signed webhook, retry, and `/api/approve/[token]` route coverage. The owner page now posts to `/api/approve/[token]` to avoid a Next.js page/route collision.

## Verification

- Focused Task 7 suites: 21 passed.
- Full Vitest suite: 30 files passed, 1 skipped; 120 passed, 2 skipped.
- TypeScript: `npm.cmd run typecheck` passed.
- Lint: `npm.cmd run lint` passed.
- Drizzle: `MIGRATION_DATABASE_URL=postgres://user:pass@localhost/db npm.cmd run db:generate` passed and produced `drizzle/0004_wooden_warlock.sql` plus snapshot/journal updates.
- Build: `VERCEL_ENV=preview` with dummy non-production environment values, `npm.cmd run build`, passed. No live credentials were used.