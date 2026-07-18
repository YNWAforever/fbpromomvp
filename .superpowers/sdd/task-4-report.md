# Task 4 report: BestTime coverage and match validation

## Status

Complete. BestTime coverage and live-reading adapters, deterministic venue matching,
venue-local coverage windows, activation guardrails, staff-scoped onboarding
services, and the staff onboarding surface are implemented. No Task 5 trigger
logic was started.

## Implemented

- Added `src/domain/venues/types.ts` with shared coverage, live-reading, match,
  and normalized business-hours contracts.
- Added deterministic `scoreVenueMatch` using Unicode NFKC, lowercase,
  punctuation/space removal, legal-suffix removal, bigram Dice similarity, and
  the required 0.70/0.30 weights and 0.72/0.55/0.60 block thresholds. Passing
  matches return `manual_review`; no automatic activation exists.
- Added coverage-window normalization for day names, numeric days, `open/close`,
  `start/end`, and string windows. Business-hours checks use Luxon venue-local
  time, including overnight windows and DST transitions.
- Added fresh/stale live-reading helpers. Unavailable readings, null deltas,
  future readings, and readings older than five minutes are never usable.
- Added `BestTimeProvider` and an injectable adapter. Coverage posts to
  `/forecasts`, live reads post to `/forecasts/live`, provider fields are
  normalized, missing analysis remains `unavailable` (never delta zero), absent
  credentials fail closed without a network call, and provider keys are redacted
  from error messages.
- Added idempotent coverage orchestration with venue-scoped snapshot reuse for
  fresh reads, forecast snapshot persistence, match scoring, and safe
  `Not applicable` results for unavailable coverage.
- Added explicit, staff-authorized `confirmMatch`. It validates snapshot venue
  ownership, rejects blocked/stale matches, records the BestTime integration and
  confirming staff ID, reads WozTell metadata/offer templates, returns activation
  blockers, and always leaves `autoActivated: false`.
- Added signed (staff-session-authorized) onboarding server actions and a new
  venue page with submitted/provider side-by-side review, match-review status,
  activation checklist, and unavailable coverage messaging. WozTell owner,
  channel, and audience references are stored in the venue-scoped integration
  metadata.

## Verification

All commands ran in `C:\Users\laich\Documents\fbpromomvp\.worktrees\off-peak-rescue-mvp`:

| Command | Result |
|---|---|
| `npm.cmd run test -- src/domain/venues src/integrations/besttime src/application/venues` | PASS — 5 files, 14 tests |
| `npm.cmd run test -- --reporter=verbose` | PASS — 12 files, 53 tests; 1 existing migration file skipped with 2 tests due test DB guard |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` with test-only environment placeholders | PASS — `/dashboard/venues/new` compiled |

No BestTime, WozTell, database, or other live credentials were added to the
repository. Provider tests use mocked fetch and explicit no-credential behavior.
