# Task 5 Retry Fix Report

## Scope

Closed the remaining Important Task 5 re-review finding without starting Task 6.

## Root cause

`monitorVenues` replayed any structurally valid stored result before checking the persisted job state. A failed run records its partial `MonitorResult`, so a retry returned that stale partial result and never reached `claimJobRun`; the failed run could not be reclaimed.

## Fix

- Replay a stored result only when `existing.state === "completed"`.
- Let failed rows proceed to `claimJobRun`, which clears the partial result and increments attempts for a retry.
- Added a regression test covering a failed job with a persisted partial result and asserting the run is reclaimed, venues are processed, and the new result is returned.

## Verification

- Focused monitor tests (`npm.cmd test -- src/application/triggers/monitor-venues.test.ts --run`): PASS — 1 file, 6 tests.
- Typecheck (`npm.cmd run typecheck`): PASS.
- Lint (`npm.cmd run lint`): PASS.

No Task 6 work, provider credentials, live database migration, or production resource changes were started.
