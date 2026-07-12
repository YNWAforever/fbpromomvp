# Off-Peak Rescue Engine MVP Design

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan
**Product owner:** Willy Lai
**Target:** Alpha-ready P0 MVP for two Hong Kong street-level venues

## 1. Objective

Build a runnable Off-Peak Rescue Engine that detects when a venue is materially quieter than forecast, asks the owner to approve a time-limited promotion through WhatsApp, broadcasts the approved offer through WozTell, records aggregate redemptions, and sends a weekly performance summary.

The MVP must satisfy product requirements P0-1 through P0-7 from the source product specification while keeping owner effort below ten minutes per week. The pilot is successful when two street-level venues complete the full trigger-to-report cycle without venue mismatches or duplicate promotions.

## 2. Confirmed Product Decisions

- The deliverable is a runnable coded P0 MVP, not only an n8n workflow package.
- The application uses a hybrid domain-core architecture.
- Next.js App Router is the application framework and Vercel is the deployment target.
- Neon Postgres is the application source of truth.
- An existing n8n instance owns schedules, orchestration, retries, and operational alerts.
- WozTell is the WhatsApp BSP and transport layer.
- Alpha targets a WozTell test environment with a Priority Group before production cutover.
- OpenCode Go is the primary copy-generation runtime behind a provider adapter.
- Deterministic Cantonese templates are the copy-generation fallback.
- The operations dashboard is restricted to Fimmick staff through Google sign-in and an email allowlist.
- Shop owners do not need application accounts; they interact through WozTell and signed mobile links.
- Alpha uses one redemption code per promotion. The owner reports the aggregate redeemed count.
- Semi-automatic approval is mandatory during Alpha. An approval timeout skips the promotion.

## 3. Scope

### 3.1 Included

- Staff onboarding and venue configuration.
- BestTime coverage and forecast validation.
- Venue name and address match validation with manual review.
- Hourly live-delta monitoring during configured business hours.
- Two-reading trigger debounce.
- Daily and weekly promotion limits.
- Cantonese promotional copy generation with three suggestions.
- Owner approve/skip flow through WozTell.
- WozTell audience broadcast with a campaign code and two-hour validity.
- Aggregate redemption reporting through a signed mobile link.
- Weekly WhatsApp summary.
- Staff operations dashboard and audit history.
- Importable n8n workflows for hourly monitoring and weekly reporting.

### 3.2 Excluded

- POS integration.
- Recipient-level redemption codes or customer-profile storage.
- Customer accounts or a customer dashboard.
- Weather and public-holiday adjustments.
- Meta or Google Ads pause/resume automation.
- Facebook or Instagram posting.
- Mall-level fallback signals.
- Multi-location customer accounts.
- Absolute footfall estimates or raw BestTime data resale.
- Non-Hong Kong markets.

## 4. Architecture

### 4.1 System boundaries

The Next.js application owns all domain rules, validation, state transitions, security decisions, and vendor abstractions. Neon Postgres holds the canonical state. n8n never decides whether a promotion is allowed; it schedules and invokes signed application operations.

The system has two application surfaces:

1. A staff-only web dashboard for onboarding, configuration, monitoring, review, and recovery.
2. Server-side API endpoints for n8n jobs, WozTell callbacks, owner redemption submissions, and internal vendor operations.

### 4.2 External services

**n8n**

- Runs the hourly venue-monitoring schedule.
- Runs the Monday 09:00 Hong Kong weekly-report schedule.
- Calls timestamped, HMAC-signed application endpoints.
- Applies bounded retries for transient failures.
- Raises an operational alert when retries are exhausted.

**BestTime**

- Performs onboarding coverage checks.
- Supplies forecast data cached in Neon and refreshed weekly.
- Supplies live delta readings during business hours.
- Is accessed only through a typed `BestTimeProvider` boundary.

**WozTell**

- Holds WhatsApp audiences and recipient-level customer data.
- Sends owner approval messages and customer broadcasts.
- Returns approval, delivery, and interaction callbacks.
- Is accessed through a typed `MessagingProvider` boundary using its Open API, Bot API, and configured channel webhooks as appropriate.

**OpenCode Go**

- Generates three structured Cantonese copy candidates.
- Receives only approved venue facts, offer facts, tone settings, and time context.
- Is accessed through a typed `CopyProvider` boundary.

**Vercel**

- Hosts the Next.js web application and APIs.
- Stores application secrets separately by environment.
- Provides preview deployments that must boot without production vendor credentials.

**Neon**

- Stores all application state and audit records.
- Uses a restricted runtime role for the application.
- Reserves the owner role for migrations and controlled administration.

## 5. Domain Components

### 5.1 Venue onboarding

The onboarding form records:

- Venue name, address, category, and timezone.
- Business hours and monitoring days.
- Owner WozTell member/contact reference.
- WozTell channel and audience identifiers.
- BestTime venue identifiers after coverage validation.
- Trigger threshold and daily/weekly limits.
- Offer templates and non-negotiable offer terms.
- Approval timeout and Alpha-safe timeout behaviour.
- Baseline sales or order estimate for later ROI comparison.

Coverage validation stores the BestTime-returned venue name and address beside the submitted values. A configurable similarity policy produces a score and decision. Low-confidence results are blocked for staff review. High-confidence results still require one explicit staff confirmation before activation.

No venue can become active unless it has usable forecast data, a confirmed match, configured business hours, a WozTell owner reference, an audience reference, and at least one approved offer template.

### 5.2 Trigger evaluator

The trigger evaluator is a deterministic domain service. A venue qualifies only when all conditions hold:

- It is active and inside configured business hours.
- The current BestTime live reading is fresh and at or below the configured threshold, initially -20 percent.
- The immediately preceding scheduled reading also meets the debounce policy, initially at or below -15 percent.
- No active or pending promotion already covers the time window.
- The venue has not promoted earlier that day.
- The venue has fewer than three promotions in the current venue-local week.

The evaluator stores every reading and every non-trigger reason. A unique idempotency key derived from venue and monitoring window prevents repeated n8n calls from creating duplicate triggers.

### 5.3 Copy generation

The application supplies OpenCode Go with a structured input containing the venue profile, approved offer template, time window, and tone. The expected output is three structured Cantonese copy candidates.

The application validates output length, required fields, prohibited claims, and exact offer facts. Discount values, expiry, redemption code, and opt-out wording are injected or verified by application code. If generation fails or validation rejects all candidates, deterministic approved templates provide safe copy.

### 5.4 Approval and broadcast

A qualifying trigger creates a pending approval with a 15-minute expiry. WozTell sends the owner the three candidates with select, edit, approve, and skip actions. An owner edit is treated as a new candidate and must pass the same offer-fact, expiry, length, and prohibited-claim validation before it can be approved. The callback identifies the approval but does not directly send a broadcast.

The application handles approval in one database transaction:

1. Deduplicate the callback event.
2. Lock and reload the pending approval.
3. Verify that it is unexpired and unresolved.
4. Recheck daily and weekly limits.
5. Create the promotion and campaign code.
6. Mark the selected copy and approval decision.
7. Queue the WozTell broadcast operation.

During Alpha, timeout always means skip. Full-auto behaviour remains disabled until the WozTell test-environment flow has passed and a later product decision explicitly enables it.

A promotion counts toward venue limits only after WozTell accepts the broadcast. Failed sends remain retryable and do not consume the venue's allowance.

### 5.5 Redemption reporting

Each promotion has one human-readable campaign code and a two-hour validity window. Neon does not store WozTell recipient profiles.

The owner receives a signed, expiring mobile link after the promotion. The page shows the venue, campaign code, send time, and expiry, then accepts an aggregate redeemed count and optional note. Resubmission updates the existing report with an audit entry rather than creating duplicates.

### 5.6 Weekly reporting

Every Monday at 09:00 Asia/Hong_Kong, n8n calls the weekly-report endpoint. For each active venue, the application aggregates:

- Live checks and qualifying trigger count.
- Approval, skip, and timeout count.
- Broadcast count and WozTell aggregate delivery figures when available.
- Reported redemption count and redemption rate.
- Average triggering live delta.
- A compact live-delta chart covering the reporting period.
- Estimated recovered revenue when baseline and average order value are present.

The application renders a concise one-page summary and sends it to the owner through WozTell. The same report is viewable in the staff dashboard.

## 6. Data Model

The initial schema contains these bounded records:

- `staff_users`: authorised staff identity and active status.
- `venues`: venue profile, lifecycle state, hours, thresholds, and limits.
- `venue_integrations`: provider identifiers and non-secret integration metadata.
- `offer_templates`: approved offer facts, copy constraints, and active state.
- `forecast_snapshots`: cached forecast metadata and freshness.
- `live_readings`: timestamped BestTime live results or normalized failures.
- `triggers`: qualifying or suppressed trigger decisions and their reasons.
- `copy_candidates`: provider, structured copy, validation result, and selection state.
- `approvals`: expiry, owner decision, callback identifiers, and resolution state.
- `promotions`: campaign code, selected copy, send state, validity, and aggregate delivery data.
- `redemption_reports`: aggregate redeemed count, source, and revision metadata.
- `weekly_reports`: period, aggregate metrics, render state, and send state.
- `job_runs`: n8n request identity, idempotency key, attempts, and result.
- `audit_events`: actor, action, object, timestamp, and safe structured metadata.

Secrets are never stored in these tables. Provider tokens, HMAC keys, auth secrets, and database credentials live in Vercel or n8n environment configuration.

## 7. API and Job Contracts

The implementation plan will assign final paths, but the design requires these operations:

- Start or continue a coverage check.
- Activate or reject a venue match.
- Evaluate one venue or a bounded batch of venues for the current monitoring window.
- Refresh weekly forecasts.
- Receive WozTell approval and delivery callbacks.
- Retry or cancel a failed promotion send.
- Submit or amend an aggregate redemption report through a signed token.
- Generate and send weekly reports for a specified venue-local reporting period.

Every n8n operation accepts an idempotency key and a timestamped HMAC signature. Every callback operation validates its dedicated secret, schema, timestamp where supplied, and provider event identifier.

## 8. Staff Product Surface

### 8.1 Overview

Shows active venues, recent triggers, pending approvals, failed jobs, and the latest weekly metrics. Operational failures are visible without exposing secret payloads.

### 8.2 Onboarding

Provides the venue form, coverage result, side-by-side match comparison, manual confirmation, WozTell references, monitoring schedule, limits, and offer-template setup.

### 8.3 Venue detail

Shows status, configuration, forecast freshness, recent readings, triggers, promotions, reports, and audit history. Staff can pause monitoring or request a safe retry.

### 8.4 Promotion detail

Shows copy candidates, selected copy, approval timeline, send state, campaign code, expiry, aggregate delivery data, and redemption report.

### 8.5 Operations

Lists provider and job failures with normalized reasons and explicit retry, cancel, or review actions. There is no generic replay button that bypasses domain checks.

## 9. Reliability and Error Handling

- Stale or failed BestTime reads never create triggers.
- Vendor adapters apply explicit timeouts and classify transient versus permanent failures.
- n8n retries transient endpoint failures with bounded exponential backoff.
- Durable idempotency and unique constraints protect all job and callback entry points.
- Database transactions protect approval, limit, promotion, and send-state transitions.
- OpenCode Go failure degrades to approved templates rather than blocking the workflow.
- WozTell failure preserves an unsent, retryable promotion and alerts staff after the retry limit.
- Partial report data is labelled; missing metrics are never presented as zero unless zero is known.
- Each domain transition writes a safe audit event.
- Preview environments use fake adapters or disabled-provider states and must not contact production audiences.

## 10. Security and Privacy

- Google authentication establishes identity; an email allowlist and active `staff_users` row establish authorisation.
- Staff actions use server-side authorisation checks, not only hidden navigation.
- n8n requests use timestamped HMAC signatures and replay windows.
- WozTell callbacks use a dedicated secret and event deduplication.
- Owner redemption links use signed, expiring, promotion-scoped tokens.
- Runtime logs redact tokens, connection strings, phone numbers, and full provider payloads.
- Recipient-level WhatsApp data remains in WozTell.
- Neon stores only owner integration references, audience identifiers, and aggregate campaign metrics needed for the product.
- The runtime database user has least-privilege access; migration credentials are separate.
- Any live credential exposed in chat or source material must be rotated before production deployment. Rotation requires explicit owner approval and is not implied by this design.

## 11. Testing Strategy

### 11.1 Unit tests

- Venue normalization and name/address match decisions.
- Coverage and activation guards.
- Trigger threshold and two-reading debounce.
- Business-hour and venue-local date handling.
- Daily and weekly promotion limits.
- Idempotency-key construction.
- Copy output validation and deterministic fallback.
- Approval expiry and state transitions.
- HMAC verification and signed redemption tokens.
- Weekly metric calculations.

### 11.2 Database integration tests

- Atomic approval-to-promotion transition.
- Concurrent approval callbacks.
- Duplicate n8n job delivery.
- Duplicate WozTell callbacks.
- Promotion-limit enforcement under concurrency.
- Retryable WozTell send states.
- Redemption resubmission and audit history.

### 11.3 Adapter contract tests

- BestTime coverage, forecast, live reading, no-data, timeout, and malformed-response fixtures.
- WozTell approval send, broadcast acceptance, delivery callback, duplicate callback, and provider-error fixtures.
- OpenCode Go valid structured output, invalid facts, timeout, and fallback fixtures.

Fixtures must be recorded or synthesized without tokens or customer PII.

### 11.4 Browser and end-to-end tests

- Staff sign-in and unauthorised access rejection.
- Venue onboarding and manual match review.
- Venue activation guardrails.
- Trigger and promotion inspection.
- Failed-operation recovery controls.
- Owner redemption form submission and resubmission.
- Complete fake-adapter flow in CI.
- Complete n8n plus WozTell test-environment smoke test before production cutover.

### 11.5 P0 acceptance coverage

Each P0 requirement receives a named acceptance test:

- P0-1 coverage check and no-charge rejection state.
- P0-2 two-reading live-delta trigger and ten-minute approval request target.
- P0-3 approved WozTell broadcast, campaign code, and expiry.
- P0-4 daily and weekly limits.
- P0-5 grounded Cantonese copy with editable, revalidated choices and fallback.
- P0-6 Monday weekly summary with the required live-delta visual.
- P0-7 mismatch blocking and manual review.

## 12. Alpha Rollout Gates

The Alpha begins with one restaurant and one retail street-level venue in the WozTell test environment.

Production cutover requires:

- Both venues pass BestTime coverage and manual match confirmation.
- No known venue mismatch remains.
- Duplicate job and callback tests pass.
- The full trigger, approval, broadcast, redemption, and weekly-report flow passes for Priority Group testers.
- Timeout behaviour is confirmed as skip.
- Operational alerts and recovery actions are verified.
- Production credentials are stored only in the correct Vercel and n8n environments.
- Any credential previously exposed in conversation or source material is rotated with explicit approval.

## 13. Implementation Constraints

- Domain logic must remain independent of route handlers, React components, n8n workflow JSON, and vendor SDK response shapes.
- Vendor adapters must be replaceable without changing trigger, approval, promotion, or reporting rules.
- n8n workflow exports are versioned in Git but contain no credentials.
- Database migrations are versioned and reviewable.
- Preview and test environments cannot send to production WozTell audiences.
- P1 and P2 work cannot enter the Alpha implementation plan unless required to satisfy a P0 acceptance test.
