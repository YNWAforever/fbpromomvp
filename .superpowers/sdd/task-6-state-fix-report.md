# Task 6 state-fix report

## Scope

Closed the remaining Task 6 P1 from task-6-final-review-report.md:

- A successful retry of an existing send_failed approval now persists state: "pending" together with the provider message ID.
- The returned approval reflects the restored pending state, so the owner decision flow can continue.
- Accepted-send reconciliation also restores a stale send_failed row to pending when it discovers the provider message ID.
- The deterministic request key remains approval:<venueId>:<triggerId>; retries reuse existing approval/candidate rows and do not create duplicate candidate rows.

## Regression coverage

The retry test now asserts:

- The first provider failure returns send_failed.
- The successful retry returns pending with providerMessageId.
- The persistence calls transition the same approval from send_failed to { state: "pending", providerMessageId }.
- Exactly two provider calls use the same request key.

The regression was observed failing before the production change because the retry returned send_failed; it passes after the state reset.

## Verification

| Check | Result |
|---|---|
| npm.cmd run test -- src/application/approvals/create-approval.test.ts | PASS - 1 file, 7 tests |
| npm.cmd run test | PASS - 23 files, 103 tests; 1 skipped file and 2 skipped tests |
| npm.cmd run typecheck | PASS |
| npm.cmd run lint | PASS |

No provider credentials or external resources were used. Task 7 remains out of scope.