# Task 7 Report

## Verdict

**IMPLEMENTED** ¡X Signed owner decisions resolve approval state atomically by event id, enforce venue scope and expiry, validate owner edits, create one queued promotion, and expose safe owner and webhook surfaces. WozTell Open API broadcasts use GraphQL with the promotion id as the provider mutation key; retries preserve that key and stop after three failures.

## Scope

- Pure approval state machine and promotion send transitions under `src/domain`.
- Signed approval link verification and owner approval page/endpoint under `src/app/approve/[token]`.
- Bearer-secret WozTell callback route with event deduplication.
- HMAC-protected promotion retry job route.
- Typed WozTell GraphQL `createBroadcast` adapter with preview/test audience isolation.
- Application decision and send services with injected repositories, audit events, expiry, limits hook, and provider receipt persistence.

## Security and idempotency

- Owner tokens are HMAC scoped to `{ venueId, approvalId, exp }`; tampered, cross-venue, and expired links fail closed.
- Webhook events require the configured Bearer secret and use `woztell:event:<eventId>` audit idempotency keys.
- Callback decisions re-check approval expiry and candidate ownership; timeout changes state to `expired` without creating a promotion.
- Broadcast calls send `promotionId` as `clientMutationId`; preview/test audiences require an explicit allowlist or prefix and reject production-like ids.
- Retry transitions are `queued -> sending -> accepted|send_failed`; accepted/cancelled rows cannot be retried and the third failure emits `promotion_retry_exhausted`.

## Verification

| Check | Result |
|---|---|
| `npm.cmd run test` | PASS ¡X 26 files, 110 tests (2 skipped) |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `git diff --cached --check` | PASS |

No live credentials, provider calls, or production resources were used.
