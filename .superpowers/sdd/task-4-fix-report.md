# Task 4 Fix Report

## Scope

Applied the Task 4 review finalizer fixes for persisted request/idempotency keys, race-safe retry handling, atomic draft metadata writes, migration coverage, and the onboarding lint failure. Task 5 was not started.

## Fixes

- Added persisted venues.idempotency_key and forecast_snapshots.request_key columns to the Drizzle schema and initial migration.
- Added unique indexes for venue idempotency keys and (venue_id, request_key) forecast snapshots.
- Added atomic createVenueIdempotent insert/reuse behavior using ON CONFLICT DO NOTHING; draft venue creation and WozTell metadata upsert now run in one transaction and retries reuse the original venue without overwriting metadata.
- Added race-safe request-key handling to forecast snapshot persistence; concurrent coverage checks converge on one snapshot, and coverage checks persist the submitted request key.
- Replaced the explicit any onboarding action state with typed state models and explicit useActionState generics.

## Verification

- Focused Task 4 tests: PASS (5 files, 24 tests): `check-coverage`, `confirm-match`, `activation`, `match`, and BestTime client.
- Typecheck (`npm.cmd run typecheck` / `tsc --noEmit`): PASS.
- Repository lint (`npm.cmd run lint`): PASS.
