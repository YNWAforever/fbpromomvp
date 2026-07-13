# Task 2 Fix Report

## Status

Complete. Fix commit: `fe50c47` (`fix: harden task 2 persistence ownership`). Task 3 was not started.

## Findings addressed

- Aligned `audit_events.actor_id` and `object_id` to UUID in both Drizzle and the canonical SQL migration. Added `drizzle/meta/0000_snapshot.json` and schema/migration assertions so a text/UUID drift fails tests.
- Added venue-scoped composite ownership constraints:
  - `triggers(venue_id, live_reading_id)` references `live_readings(venue_id, id)`.
  - `approvals(venue_id, trigger_id)` references `triggers(venue_id, id)`.
  - `approvals(trigger_id, selected_candidate_id)` references `copy_candidates(trigger_id, id)`.
  - `promotions(venue_id, approval_id)` references `approvals(venue_id, id)`.
  Composite target indexes are created before their foreign keys in the initial migration. Approval validity is bounded to 15 minutes, promotion validity to at most two hours, and redemption counts/revisions have database checks.
- Added transaction-scoped repository guards that load related rows and reject cross-venue trigger/readings, approval/triggers/candidates, and promotion/approvals before writes.
- Hardened redemption upserts: first revision is 1, revisions advance only when count/note changes, stale/skipped revisions are rejected, `updatedAt` advances on changes, and a conditional update detects concurrent writes.
- Drizzle config now requires `MIGRATION_DATABASE_URL` and explicitly refuses to fall back to runtime `DATABASE_URL`.
- Expanded migration integration assertions for audit UUID types, ownership foreign keys, and validity checks. These assertions remain TEST_DATABASE_URL-only and never connect to Neon without an approved test URL.

## Verification

| Command | Result |
|---|---|
| `npm.cmd run test` | PASS — 28 passed; 2 migration tests skipped because `TEST_DATABASE_URL` is unset |
| `npm.cmd run test -- src/db` | PASS — 10 passed; 2 migration tests skipped |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint -- src/db drizzle.config.ts` | PASS |
| `MIGRATION_DATABASE_URL=postgresql://migration:test@example.test/test npx.cmd drizzle-kit check` | PASS |
| `npx.cmd drizzle-kit check` without `MIGRATION_DATABASE_URL` | FAILS clearly with the migration-only URL error |
| Approved test database migration/integration | DEFERRED — no `TEST_DATABASE_URL` supplied; no real Neon connection attempted |

## Notes

The migration and snapshot were regenerated from the corrected schema. The repository remains on the Task 2 worktree/branch; no Task 3 work was dispatched.