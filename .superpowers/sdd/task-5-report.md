# Task 5 report: deterministic trigger policy and hourly monitor endpoint

Implemented Task 5 without starting Task 6.

## Delivered

- Added the ordered, pure trigger evaluator and policy types. It enforces active
  status, venue-local business hours, missing/fresh BestTime readings, current
  and preceding delta thresholds, pending-promotion suppression, and daily and
  weekly caps. Every decision has a persisted reason; qualifying readings use
  `candidate/sustained_quiet` and non-qualifying runs use `skip` (with an
  explicit `manual_review` decision available to callers).
- Added timestamped SHA-256 HMAC signing and verification for `${timestamp}.${rawBody}`.
  Verification enforces the five-minute replay window, `timingSafeEqual`, and
  malformed-signature safety.
- Added the bounded `monitorVenues` application service. It claims a job by
  idempotency key, processes at most 25 active venues, scopes integration and
  reading writes to each venue, stores live readings and trigger/audit records,
  dispatches only new candidates, and returns stable processed/candidate/
  suppressed/failure counts. A completed duplicate job returns the stored result.
- Added the signed `POST /api/jobs/monitor` route. It requires
  `x-job-timestamp`, `x-job-signature`, and `idempotency-key`, validates
  `{ runId, scheduledAt }`, and has no test-only production bypass.

## Verification

All commands ran in `C:\Users\laich\Documents\fbpromomvp\.worktrees\off-peak-rescue-mvp`:

```text
npm.cmd run test -- src/domain/triggers src/lib/security/hmac.test.ts src/app/api/jobs/monitor
  Test Files  3 passed (3)
  Tests       8 passed (8)

npm.cmd run typecheck
  passed

npm.cmd run lint -- src/domain/triggers src/lib/security src/application/triggers src/app/api/jobs/monitor
  passed
```

No provider keys, Neon credentials, or test-only runtime endpoints were added.

