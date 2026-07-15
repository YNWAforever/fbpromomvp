# Task 7 final fix report

## Scope

Closed both P1 findings from `task-7-rereview-report.md` without live provider calls or production resources.

## Fixes

- `sendPromotion` now defaults to the imported `updatePromotionIfState` conditional updater. The unconditioned updater remains available only when explicitly injected as a unit-test seam, so concurrent retry requests cannot both claim a queued/send-failed row.
- Provider invocation and accepted-state reconciliation are separate phases. A WozTell receipt is persisted with an idempotent accepted audit marker; persistence/audit failures produce `send_persistence_failed`, never `send_failed`, and never trigger a second provider send. A later `sending` retry reconciles the durable receipt marker without calling WozTell.
- Added regressions covering accepted-provider/local-persistence failure and marker reconciliation without resend.

## Verification

- Focused promotion suite: `npm.cmd run test -- src/application/promotions/send-promotion.test.ts --run` ? 1 file, 6 tests passed.
- Full Vitest suite: `npm.cmd run test -- --run` ? 30 files passed, 1 skipped; 122 tests passed, 2 skipped.
- TypeScript: `npm.cmd run typecheck` ? passed.
- Lint: `npm.cmd run lint` ? passed.
- Preview build: `npm.cmd run build` with schema-valid disposable placeholder environment values ? passed.
- `git diff --check` ? passed.

Task 8 was not started.
