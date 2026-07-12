# Off-Peak Rescue Engine MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a Vercel-deployable P0 rescue engine that onboards eligible venues, detects sustained quiet periods, obtains WozTell approval, broadcasts grounded Cantonese offers, records aggregate redemptions, and sends weekly reports.

**Architecture:** A Next.js App Router application owns domain decisions, security, persistence, and typed provider adapters. Neon Postgres is the source of truth; n8n calls HMAC-protected job endpoints; WozTell handles WhatsApp transport; BestTime provides forecast/live signals; OpenCode Go provides copy with deterministic fallback.

**Tech Stack:** Node.js 20.9+, Next.js App Router, React, TypeScript, Tailwind CSS, Auth.js (`next-auth@beta`), Drizzle ORM, Neon serverless driver, Zod, Luxon, Vitest, Testing Library, Playwright, n8n, WozTell Open API/Bot API, BestTime API, OpenCode Go OpenAI-compatible API.

## Global Constraints

- Implement P0-1 through P0-7 only.
- Use `Asia/Hong_Kong` for venue-local time and Monday 09:00 reporting.
- Initial trigger policy: current delta `<= -20`, previous scheduled delta `<= -15`, one accepted broadcast per venue-local day, three per venue-local week.
- Approval expires after 15 minutes and skips on timeout; no full-auto path in Alpha.
- One campaign code per promotion, valid two hours; Neon stores aggregate delivery/redemption data only.
- All n8n writes use timestamped HMAC plus idempotency key; WozTell callbacks are secret-validated and deduplicated.
- Preview/test environments cannot address production WozTell audiences.
- Runtime DB credentials use a restricted Neon role; migration credentials stay separate.
- Do not rotate credentials or provision paid/cloud resources without explicit approval.
- Requirements source: `docs/superpowers/specs/2026-07-12-off-peak-rescue-engine-mvp-design.md`.

## File Structure

- `src/domain/venues`, `triggers`, `copy`, `approvals`, `promotions`, `reports` ??pure rules and types.
- `src/application/*` ??transaction-oriented use cases.
- `src/db/schema.ts`, `client.ts`, `repositories/*` ??Neon/Drizzle persistence.
- `src/integrations/besttime`, `opencode-go`, `woztell`, `fakes` ??replaceable providers.
- `src/lib/auth`, `src/lib/security` ??staff authorization, HMAC, signed links.
- `src/app/(staff)/dashboard/*` ??staff operations UI.
- `src/app/api/jobs/*`, `src/app/api/webhooks/woztell/route.ts` ??n8n and WozTell entry points.
- `src/app/redeem/[token]`, `src/app/reports/[token]` ??signed owner/report surfaces.
- `n8n/workflows/*` ??credential-free workflow exports.
- `tests/e2e/*`, `docs/integrations/*`, `docs/operations/*` ??acceptance tests and runbooks.

## Shared Type Contracts

```ts
export type OfferFacts = { headline: string; benefit: string; conditions: string[] };
export type CoverageResult = {
  available: boolean; providerVenueId?: string; matchedName?: string;
  matchedAddress?: string; forecast?: Record<string, unknown>;
  reason?: "no_data" | "provider_error";
};
export type LiveReading = {
  observedAt: Date; forecastedBusyness: number | null; liveBusyness: number | null;
  delta: number | null; status: "ok" | "unavailable";
};
export type CopyInput = { venueName: string; facts: OfferFacts; expiresAt: string; tone: string };
export type CopyCandidate = {
  body: string; source: "model" | "fallback" | "owner_edit";
  valid: boolean; validationErrors: string[];
};
export type ApprovalMessage = {
  approvalId: string; memberId: string; expiresAt: string;
  candidates: Array<{ id: string; body: string }>;
};
export type BroadcastInput = {
  promotionId: string; audienceId: string; name: string;
  messages: Record<string, unknown>; scheduleAt: number;
};
export type BroadcastReceipt = {
  broadcastId: string; memberCount: number | null; sentCount: number | null;
};
export type WeeklyReportMessage = {
  memberId: string; text: string; reportUrl: string; imageUrl: string;
};
export interface BestTimeProvider {
  checkCoverage(input: { name: string; address: string }): Promise<CoverageResult>;
  getLive(providerVenueId: string): Promise<LiveReading>;
}
export interface CopyProvider { generate(input: CopyInput): Promise<CopyCandidate[]>; }
export interface MessagingProvider {
  sendApproval(input: ApprovalMessage): Promise<{ messageId: string }>;
  createBroadcast(input: BroadcastInput): Promise<BroadcastReceipt>;
  sendWeeklyReport(input: WeeklyReportMessage): Promise<{ messageId: string }>;
}
```

Later tasks import these contracts without renaming signatures.

---

### Task 1: Bootstrap the app, environment contract, and tests

**Files:**
- Create: `package.json`, `.env.example`, `src/env.ts`, `src/env.test.ts`
- Create: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`
- Create: generated Next.js files under `src/app`, plus `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`

**Interfaces:**
- Produces: `parseServerEnv(input): ServerEnv`, `env`, and scripts `test`, `test:integration`, `test:e2e`, `typecheck`, `db:generate`, `db:migrate`.
- Consumes: no earlier task.

- [ ] **Step 1: Scaffold and install dependencies**

```powershell
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
npm install zod luxon drizzle-orm @neondatabase/serverless ws next-auth@beta
npm install -D drizzle-kit vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/luxon @types/ws @playwright/test tsx
```

Expected: installation exits 0 and preserves `docs/`.

- [ ] **Step 2: Write a failing environment test**

```ts
import { expect, it } from "vitest";
import { parseServerEnv } from "./env";

it("normalizes staff emails and permits absent providers in tests", () => {
  const value = parseServerEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://app:secret@example.test/app",
    AUTH_SECRET: "12345678901234567890123456789012",
    AUTH_GOOGLE_ID: "id",
    AUTH_GOOGLE_SECRET: "secret",
    ADMIN_EMAILS: "OPS@example.com, owner@example.com",
    N8N_HMAC_SECRET: "12345678901234567890123456789012",
    OWNER_LINK_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
  });
  expect(value.ADMIN_EMAILS).toEqual(["ops@example.com", "owner@example.com"]);
  expect(value.BESTTIME_PRIVATE_KEY).toBeUndefined();
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm run test -- src/env.test.ts`

Expected: FAIL because the test script and `src/env.ts` do not exist.

- [ ] **Step 4: Implement environment parsing and runner configuration**

`src/env.ts` uses Zod for all keys in `.env.example`: `DATABASE_URL`, optional `TEST_DATABASE_URL`, Auth.js keys, `ADMIN_EMAILS`, `N8N_HMAC_SECRET`, `OWNER_LINK_SECRET`, BestTime keys/base URL, WozTell token/app/channel/environment/tree/node/webhook/Priority Group keys, OpenCode Go key/model/base URL, and `APP_BASE_URL`. Provider keys are optional in development/test/preview and required in production. Defaults are:

```ts
BESTTIME_BASE_URL: "https://besttime.app/api/v1";
WOZTELL_OPEN_API_URL: "https://open.api.woztell.com/v3";
WOZTELL_BOT_API_URL: "https://bot.api.woztell.com";
OPENCODE_GO_BASE_URL: "https://opencode.ai/zen/go/v1";
OPENCODE_GO_MODEL: "deepseek-v4-flash";
```

Configure Vitest for jsdom and `@/*`, add Testing Library setup, and add exact scripts named in Interfaces.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test -- src/env.test.ts
npm run typecheck
npm run lint
git add package.json package-lock.json .env.example src vitest.config.ts vitest.setup.ts playwright.config.ts tsconfig.json eslint.config.mjs next.config.ts
git commit -m "chore: bootstrap rescue engine application"
```

Expected: tests PASS; typecheck/lint exit 0; commit contains no secret values.

---

### Task 2: Add Neon schema, migration, and repositories

**Files:**
- Create: `drizzle.config.ts`, `drizzle/0000_initial.sql`
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/schema.test.ts`
- Create: `src/db/repositories/venues.ts`, `jobs.ts`, `triggers.ts`, `promotions.ts`, `reports.ts`, `audit.ts`
- Create: `vitest.integration.config.ts`, `src/db/migration.integration.test.ts`

**Interfaces:**
- Produces: `withDatabase<T>(work): Promise<T>` and focused repository interfaces accepting a shared Drizzle transaction.
- Consumes: `env.DATABASE_URL`.

- [ ] **Step 1: Write a failing table-export test**

```ts
import { expect, it } from "vitest";
import * as schema from "./schema";

it("exports all bounded MVP records", () => {
  expect(Object.keys(schema).sort()).toEqual([
    "approvals", "auditEvents", "copyCandidates", "forecastSnapshots", "jobRuns",
    "liveReadings", "offerTemplates", "promotions", "redemptionReports", "staffUsers",
    "triggers", "venueIntegrations", "venues", "weeklyReports",
  ]);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/db/schema.test.ts`

Expected: FAIL because `schema.ts` is absent.

- [ ] **Step 3: Implement schema and matching SQL migration**

Use UUID PKs, timestamptz, JSONB, and these unique constraints:

```text
staff_users(email)
venue_integrations(venue_id, provider)
live_readings(venue_id, observed_at)
triggers(idempotency_key)
approvals(trigger_id)
promotions(approval_id)
promotions(campaign_code)
redemption_reports(promotion_id)
weekly_reports(venue_id, period_start)
job_runs(idempotency_key)
```

Use this exact column map in Drizzle and SQL: `staff_users(email,name,active)`; `venues(name,address,category,timezone,status,business_hours,trigger_delta,previous_delta,daily_limit,weekly_limit,approval_timeout_minutes,baseline_sales,average_order_value)`; `venue_integrations(venue_id,provider,external_id,metadata,confirmed_at)`; `offer_templates(venue_id,name,offer_facts,woztell_message_payload,active)`; `forecast_snapshots(venue_id,provider_venue_id,matched_name,matched_address,match_score,payload,fetched_at,expires_at)`; `live_readings(venue_id,observed_at,forecasted_busyness,live_busyness,delta,status,error_code,provider_request_id)`; `triggers(venue_id,live_reading_id,idempotency_key,decision,reason)`; `copy_candidates(trigger_id,provider,body,source,valid,validation_errors)`; `approvals(trigger_id,state,selected_candidate_id,provider_message_id,expires_at,resolved_at)`; `promotions(venue_id,approval_id,campaign_code,body,state,valid_from,valid_until,provider_broadcast_id,member_count,sent_count,accepted_at)`; `redemption_reports(promotion_id,count,note,revision,updated_at)`; `weekly_reports(venue_id,period_start,period_end,metrics,chart_points,state,provider_message_id)`; `job_runs(kind,idempotency_key,state,attempts,result,completed_at)`; `audit_events(actor_type,actor_id,action,object_type,object_id,metadata)`. Every table also has UUID `id` and `created_at`.

- [ ] **Step 4: Implement request-scoped Neon connection**

```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "@/env";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;
export type Database = NeonDatabase<typeof schema>;
export async function withDatabase<T>(work: (db: Database) => Promise<T>) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try { return await work(drizzle(pool, { schema })); }
  finally { await pool.end(); }
}
```

Repository methods receive `db` explicitly so approval/broadcast transitions share one transaction.

- [ ] **Step 5: Verify migration only against an approved test database**

```powershell
npm run test -- src/db/schema.test.ts
npx drizzle-kit check
$env:DATABASE_URL=$env:TEST_DATABASE_URL; npm run db:migrate
npm run test:integration -- src/db/migration.integration.test.ts
```

Expected: schema/check PASS and integration test finds 14 tables. Do not mutate the supplied owner database without explicit approval.

- [ ] **Step 6: Commit**

```powershell
git add drizzle.config.ts drizzle src/db vitest.integration.config.ts package.json package-lock.json
git commit -m "feat: add rescue engine persistence model"
```

---

### Task 3: Add staff-only Google authentication

**Files:**
- Create: `auth.ts`, `proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth/require-staff.ts`, `src/lib/auth/require-staff.test.ts`
- Create: `src/app/sign-in/page.tsx`, `src/app/(staff)/dashboard/layout.tsx`, `page.tsx`

**Interfaces:**
- Produces: `requireStaff(): Promise<{ id; email; name }>`.
- Consumes: `staff_users`, `env.ADMIN_EMAILS`, `withDatabase`.

- [ ] **Step 1: Write failing active-staff tests**

```ts
const staff = { id: "staff-1", email: "ops@example.com", name: "Ops" };
await expect(authorizeStaff("ops@example.com", ["ops@example.com"], async () => null))
  .rejects.toThrow("Staff access denied");
await expect(authorizeStaff("ops@example.com", ["ops@example.com"], async () => staff))
  .resolves.toEqual(staff);
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/lib/auth/require-staff.test.ts`

Expected: FAIL because authorization is absent.

- [ ] **Step 3: Implement Auth.js and server-side authorization**

`auth.ts` uses Google and rejects emails outside `ADMIN_EMAILS`. Export `{ handlers, auth, signIn, signOut }`; route exports `GET`/`POST`; Next.js 16 `proxy.ts` matches `/dashboard/:path*`. `requireStaff` calls `auth()`, then requires an active DB row; dashboard layout calls it before rendering.

- [ ] **Step 4: Add sign-in and empty dashboard shell**

Sign-in uses a server action calling `signIn("google", { redirectTo: "/dashboard" })`. Dashboard navigation contains Overview, Venues, Promotions, Reports, Operations and displays real empty states only.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test -- src/lib/auth/require-staff.test.ts
npm run typecheck
npm run build
git add auth.ts proxy.ts src/app/api/auth src/lib/auth src/app/sign-in src/app/\(staff\)/dashboard
git commit -m "feat: protect staff dashboard with Google auth"
```

---

### Task 4: Implement BestTime coverage and match validation

**Files:**
- Create: `src/domain/venues/{types,match,match.test,activation}.ts`
- Create: `src/integrations/besttime/{types,client,client.test}.ts`
- Create: `src/application/venues/{check-coverage,confirm-match}.ts`
- Create: `src/app/(staff)/dashboard/venues/new/page.tsx`, `actions.ts`

**Interfaces:**
- Produces: `BestTimeProvider.checkCoverage`, `BestTimeProvider.getLive`, `scoreVenueMatch`, `checkVenueCoverage`, `confirmMatch`.
- Consumes: venue/forecast/integration repositories and staff identity.

- [ ] **Step 1: Write failing known-case tests**

```ts
expect(scoreVenueMatch(
  { name: "?謜???", address: "?剛????18?? },
  { name: "?抆?謒?隞輻?", address: "?剛????20?? },
).decision).toBe("blocked");
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/domain/venues/match.test.ts`

Expected: FAIL because matching is absent.

- [ ] **Step 3: Implement deterministic matching**

Normalize with Unicode NFKC, lowercase, punctuation/space removal, and legal-suffix removal. Calculate bigram Dice similarity with name weight `0.70` and address weight `0.30`. Block below total `0.72`, name `0.55`, or address `0.60`; all other results require manual review. There is no automatic activation.

- [ ] **Step 4: Implement and test BestTime adapter**

`checkCoverage` POSTs `${BESTTIME_BASE_URL}/forecasts`; `getLive` POSTs `${BESTTIME_BASE_URL}/forecasts/live`. Parse `analysis.venue_live_forecasted_delta`, `venue_forecasted_busyness`, `venue_live_busyness`. Missing availability becomes `unavailable`, never delta zero. Tests mock fetch and prove API keys are redacted from errors.

- [ ] **Step 5: Implement onboarding service and UI**

Create draft venue, store returned matched name/address/ID/forecast and score, show side-by-side review, and block activation unless forecast, confirmed match, business hours, WozTell owner/channel/audience metadata, and active offer template exist. Unavailable coverage returns `Not applicable` within the five-minute target and never activates.

- [ ] **Step 6: Verify and commit**

```powershell
npm run test -- src/domain/venues src/integrations/besttime
npm run typecheck
git add src/domain/venues src/integrations/besttime src/application/venues src/app/\(staff\)/dashboard/venues
git commit -m "feat: validate venue coverage during onboarding"
```

---

### Task 5: Implement trigger policy and hourly n8n endpoint

**Files:**
- Create: `src/domain/triggers/{types,evaluate,evaluate.test}.ts`
- Create: `src/lib/security/{hmac,hmac.test}.ts`
- Create: `src/application/triggers/monitor-venues.ts`
- Create: `src/app/api/jobs/monitor/{route,route.test}.ts`

**Interfaces:**
- Produces: `evaluateTrigger(input): TriggerDecision`, `verifyHmacRequest`, `monitorVenues`.
- Consumes: BestTime live adapter, repositories, injected `CandidateDispatcher(triggerId)`.

- [ ] **Step 1: Write failing policy tests**

```ts
const base = { active: true, insideBusinessHours: true, currentDelta: -25, previousDelta: -18,
  hasPendingPromotion: false, acceptedToday: 0, acceptedThisWeek: 0, dailyLimit: 1, weeklyLimit: 3 };
expect(evaluateTrigger(base)).toEqual({ decision: "candidate", reason: "sustained_quiet" });
expect(evaluateTrigger({ ...base, previousDelta: -10 }).reason).toBe("debounce");
expect(evaluateTrigger({ ...base, acceptedToday: 1 }).reason).toBe("daily_limit");
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/domain/triggers/evaluate.test.ts`

Expected: FAIL because evaluator is absent.

- [ ] **Step 3: Implement pure ordered evaluation**

Check inactive, outside hours, missing/stale data, threshold, debounce, pending promotion, daily limit, weekly limit, then candidate. Persist every reading and suppression reason.

- [ ] **Step 4: Implement HMAC and route tests**

SHA-256 signs `${timestamp}.${rawBody}`; reject more than 300 seconds skew; compare with `timingSafeEqual`; require `x-job-timestamp`, `x-job-signature`, `idempotency-key`. Test valid, replay, changed body, and duplicate idempotency.

- [ ] **Step 5: Implement bounded monitor service**

Load up to 25 active venues, store readings, evaluate, store triggers, dispatch candidates. Duplicate job keys return stored results. Route validates `{ runId, scheduledAt }`; returns `{ processed, candidates, suppressed, failures }`.

- [ ] **Step 6: Verify and commit**

```powershell
npm run test -- src/domain/triggers src/lib/security/hmac.test.ts src/app/api/jobs/monitor
npm run typecheck
git add src/domain/triggers src/lib/security src/application/triggers src/app/api/jobs/monitor
git commit -m "feat: evaluate sustained quiet-period triggers"
```

---

### Task 6: Generate grounded copy and send WozTell approvals

**Files:**
- Create: `src/domain/copy/{types,validate,validate.test,fallback}.ts`
- Create: `src/integrations/opencode-go/{client,client.test}.ts`
- Create: `src/integrations/woztell/{bot-client,bot-client.test}.ts`
- Create: `src/application/approvals/create-approval.ts`

**Interfaces:**
- Produces: `CopyProvider.generate`, `MessagingProvider.sendApproval`, `createApprovalForTrigger`.
- Consumes: trigger/offer/copy/approval repositories.

- [ ] **Step 1: Write failing grounding/fallback tests**

```ts
const approvedFacts = {
  headline: "下午茶減 HK$20",
  benefit: "惠顧滿 HK$100 即減 HK$20",
  conditions: ["只限堂食"],
};
expect(validateCopyCandidate("全單半價", approvedFacts).valid).toBe(false);
expect(fallbackCandidates({ venueName: "蘭苑", facts: approvedFacts, expiresAt: "17:00" })).toHaveLength(3);
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/domain/copy`

Expected: FAIL because validator/fallback are absent.

- [ ] **Step 3: Implement grounding and three exact fallback shapes**

Require approved benefit text; reject unapproved currency/percentage claims and bodies over 500 code points. Application code inserts two-hour expiry and opt-out wording. Fallbacks respectively use: direct support appeal, limited neighbourhood offer, and quiet-time invitation; all interpolate only approved facts.

- [ ] **Step 4: Implement OpenCode Go client**

POST `${OPENCODE_GO_BASE_URL}/chat/completions` with Bearer key, configured model, temperature `0.4`, and JSON-only `{ candidates: [{ body }] }` instruction. Parse with Zod; validate each body; fill fewer than three valid outputs from fallbacks. Tests prove invalid output falls back and keys are redacted.

- [ ] **Step 5: Implement WozTell Bot approval redirect**

POST `${WOZTELL_BOT_API_URL}/redirectMemberToNode?accessToken=...` with configured channel, member, tree/node, and meta `{ approvalId, expiresAt, candidates }`; set all three redirect execution flags true. Never log token/member ID.

- [ ] **Step 6: Implement approval creation, verify, commit**

Persist exactly three candidates; create 15-minute approval; send it; store provider reference. A provider failure leaves `send_failed` approval and audit event, with no promotion.

```powershell
npm run test -- src/domain/copy src/integrations/opencode-go src/integrations/woztell
npm run typecheck
git add src/domain/copy src/integrations/opencode-go src/integrations/woztell src/application/approvals
git commit -m "feat: generate grounded promotion approvals"
```

---

### Task 7: Resolve WozTell decisions and broadcast safely

**Files:**
- Create: `src/domain/approvals/{resolve,resolve.test}.ts`
- Create: `src/domain/promotions/{code,transitions,transitions.test}.ts`
- Create: `src/integrations/woztell/{open-api-client,open-api-client.test}.ts`
- Create: `src/application/approvals/handle-decision.ts`
- Create: `src/application/promotions/send-promotion.ts`
- Create: `src/app/api/webhooks/woztell/{route,route.test}.ts`
- Create: `src/app/api/jobs/retry-promotion/route.ts`

**Interfaces:**
- Produces: `handleApprovalDecision`, `createBroadcast`, `sendPromotion`.
- Consumes: approval/copy/promotion/job/audit persistence.

- [ ] **Step 1: Write failing state tests**

```ts
const now = new Date("2026-07-12T07:00:00.000Z");
const expiresAt = new Date("2026-07-12T07:15:00.000Z");
const afterExpiry = new Date("2026-07-12T07:16:00.000Z");
expect(resolveApproval({ state: "pending", now, expiresAt, action: "approve" })).toEqual({ next: "approved" });
expect(resolveApproval({ state: "pending", now: afterExpiry, expiresAt, action: "approve" })).toEqual({ next: "expired" });
expect(resolveApproval({ state: "approved", now, expiresAt, action: "approve" })).toEqual({ next: "unchanged" });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/domain/approvals`

Expected: FAIL because the state machine is absent.

- [ ] **Step 3: Implement callback schema and atomic decision**

Validate `{ eventId, approvalId, action: select|edit|approve|skip, candidateId?, editedBody?, occurredAt }`; require Bearer webhook secret; deduplicate event ID. Revalidate owner edits. In one transaction lock pending approval, verify expiry, recheck limits, create one promotion, resolve approval. Timeout always expires without promotion.

- [ ] **Step 4: Implement WozTell GraphQL broadcast**

```graphql
mutation CreateBroadcast($input: CreateBroadcastInput!) {
  createBroadcast(input: $input) {
    clientMutationId
    broadcast { id memberCount sentCount sent sentStart sentEnd }
  }
}
```

Input uses configured app/channel, promotion ID as client mutation ID, approved audience, approved template `messages`, code/copy/expiry interpolation, priority, schedule time. Reject production audiences outside production.

- [ ] **Step 5: Implement send/retry transitions**

Allow `queued -> sending -> accepted` or `send_failed`; only accepted counts toward limits. Retry refuses accepted/cancelled, uses the same promotion ID, and stops after three failures with an audit event.

- [ ] **Step 6: Verify and commit**

```powershell
npm run test -- src/domain/approvals src/domain/promotions src/integrations/woztell src/app/api/webhooks/woztell src/app/api/jobs/retry-promotion
npm run typecheck
git add src/domain/approvals src/domain/promotions src/integrations/woztell src/application src/app/api/webhooks/woztell src/app/api/jobs/retry-promotion
git commit -m "feat: approve and broadcast quiet-period promotions"
```

---

### Task 8: Add signed aggregate redemption reporting

**Files:**
- Create: `src/lib/security/{signed-token,signed-token.test}.ts`
- Create: `src/application/redemptions/{submit-redemption,submit-redemption.test}.ts`
- Create: `src/app/redeem/[token]/page.tsx`, `src/app/redeem/[token]/actions.ts`, `src/app/redeem/[token]/redemption-form.tsx`

**Interfaces:**
- Produces: `signScopedToken`, `verifyScopedToken`, `submitRedemption`.
- Consumes: promotion/redemption/audit persistence.

- [ ] **Step 1: Write failing token/revision tests**

Test valid promotion token, expiry, tampering, wrong scope, negative count, first revision 1, corrected revision 2.

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/lib/security/signed-token.test.ts src/application/redemptions`

Expected: FAIL because services are absent.

- [ ] **Step 3: Implement token and submission**

Base64url-encode versioned `{ scope, subject, exp }`, append HMAC-SHA256, and verify with `timingSafeEqual`. Count is integer `0..100000`; note max 500 chars. Upsert by promotion, increment revision only on change, audit old/new count.

- [ ] **Step 4: Build mobile page**

Server verifies token before loading; shows venue, code, sent time, expiry, prior count, numeric input, note. Server action re-verifies token and ignores hidden IDs. Invalid/expired links show a safe state.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test -- src/lib/security/signed-token.test.ts src/application/redemptions
npm run typecheck
git add src/lib/security/signed-token* src/application/redemptions src/app/redeem
git commit -m "feat: collect aggregate promotion redemptions"
```

---

### Task 9: Generate and send weekly reports

**Files:**
- Create: `src/domain/reports/{aggregate,aggregate.test}.ts`
- Create: `src/application/reports/{generate-weekly,send-weekly}.ts`
- Create: `src/app/api/jobs/weekly-report/route.ts`
- Create: `src/app/reports/[token]/page.tsx`, `image/route.tsx`
- Create: `src/components/reports/delta-chart.tsx`

**Interfaces:**
- Produces: `aggregateWeeklyReport`, `generateWeeklyReports`, signed report/image URLs.
- Consumes: HMAC, signed tokens, report repositories, WozTell Bot client.

- [ ] **Step 1: Write failing aggregation tests**

```ts
expect(aggregateWeeklyReport({ readings: [], triggers: [], promotions: [{ sentCount: null }], redemptions: [] }).sentCount).toBeNull();
const sample = {
  readings: [{ observedAt: "2026-07-06T07:00:00Z", delta: -25 }],
  triggers: [{ decision: "candidate" }],
  promotions: [{ sentCount: 100 }],
  redemptions: [{ count: 8 }],
};
expect(aggregateWeeklyReport(sample).chartPoints).toEqual([{ at: "2026-07-06T07:00:00Z", delta: -25 }]);
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/domain/reports`

Expected: FAIL because aggregation is absent.

- [ ] **Step 3: Implement metrics and visual**

Return checks, triggers, approvals/skips/timeouts, accepted broadcasts, nullable sent count/rate/revenue, redeemed count, average trigger delta, ordered chart points. Use a 14-day report token. HTML and `ImageResponse` 1200x630 render identical metrics and inline SVG polyline; unknown stays unavailable.

- [ ] **Step 4: Implement weekly job and send**

HMAC route validates `{ runId, periodStart, periodEnd }`, deduplicates job, generates one report per active venue, and sends signed HTML/image URLs through WozTell Bot API. Store provider message ID.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test -- src/domain/reports src/app/api/jobs/weekly-report
npm run typecheck
npm run build
git add src/domain/reports src/application/reports src/app/api/jobs/weekly-report src/app/reports src/components/reports
git commit -m "feat: send weekly quiet-period performance reports"
```

---

### Task 10: Complete the staff operations dashboard

**Files:**
- Create: `src/app/(staff)/dashboard/venues/page.tsx`, `[venueId]/page.tsx`
- Create: `src/app/(staff)/dashboard/promotions/page.tsx`, `[promotionId]/page.tsx`
- Create: `src/app/(staff)/dashboard/reports/page.tsx`
- Create: `src/app/(staff)/dashboard/operations/page.tsx`, `actions.ts`
- Create: `src/components/status-badge.tsx`, `src/components/empty-state.tsx`, `src/components/metric-card.tsx`, `src/components/operations-table.tsx`
- Create: `src/app/(staff)/dashboard/dashboard.test.tsx`

**Interfaces:**
- Produces: complete staff UI and safe retry/cancel/pause actions.
- Consumes: all application query/services and `requireStaff`.

- [ ] **Step 1: Write failing dashboard tests**

```tsx
render(<OperationsTable rows={[{ id: "p1", state: "send_failed", reason: "provider_timeout" }]} />);
expect(screen.getByRole("button", { name: "Retry promotion" })).toBeEnabled();
```

Also assert no Retry for accepted promotions and coverage mismatch appears as `Needs match review`.

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test -- src/app/\(staff\)/dashboard/dashboard.test.tsx`

Expected: FAIL because operations components are absent.

- [ ] **Step 3: Implement pages and safe actions**

All pages are server-authorized. Statuses are exact: `Blocked coverage`, `Needs match review`, `Provider unavailable`, `Approval pending`, `Approval expired`, `Send failed`, `Report incomplete`, `Active`. Venue page shows configuration/readings/triggers/promotions/reports/audit. Promotion shows candidates/edit/approval/delivery/code/validity/redemption. Retry calls Task 7 service; cancel only queued/send-failed; pause audits staff identity. UI never calls providers directly.

- [ ] **Step 4: Verify and commit**

```powershell
npm run test -- src/app/\(staff\)/dashboard
npm run typecheck
npm run lint
npm run build
git add src/app/\(staff\)/dashboard src/components
git commit -m "feat: add rescue engine operations dashboard"
```

---

### Task 11: Version n8n workflows, acceptance tests, CI, and runbooks

**Files:**
- Create: `n8n/workflows/hourly-monitor.json`, `weekly-report.json`
- Create: `scripts/n8n/sign-request.js`, `scripts/n8n/sign-request.test.ts`
- Create: `scripts/smoke/besttime.ts`, `scripts/smoke/woztell.ts`
- Create: `src/integrations/fakes/*`, `src/test/fixtures/{besttime,woztell,opencode-go}/*.json`
- Create: `tests/e2e/alpha-flow.spec.ts`, `tests/e2e/helpers.ts`
- Create: `docs/integrations/woztell-alpha.md`, `docs/operations/alpha-runbook.md`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`, `package.json`

**Interfaces:**
- Produces: importable workflows, fake-provider CI, complete P0 acceptance flow, deployment/cutover docs.
- Consumes: all earlier tasks.

- [ ] **Step 1: Add cross-runtime signing test**

```js
const crypto = require("node:crypto");
function sign(body, timestamp, secret) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
module.exports = { sign };
```

Test equality with application HMAC for the same input.

- [ ] **Step 2: Create/import/re-export hourly workflow**

Nodes: hourly schedule `0 * * * *` in `Asia/Hong_Kong`; Code node builds `{ runId, scheduledAt }`, timestamp, HMAC, `hourly:${$execution.id}`; HTTP POST `/api/jobs/monitor`; three retries with five-second wait; non-2xx to existing alert destination. Remove credential IDs from committed export.

- [ ] **Step 3: Create/import/re-export weekly workflow**

Schedule `0 9 * * 1` in `Asia/Hong_Kong`; compute previous Monday-to-current-Monday ISO period; sign and POST `/api/jobs/weekly-report`; same retry/alert rules.

- [ ] **Step 4: Add fake providers and browser lifecycle**

Fake BestTime yields two qualifying readings; fake OpenCode Go yields three grounded candidates; fake WozTell records approval/broadcast. Playwright performs onboarding, manual match confirmation, two signed hourly calls, fake approve callback, accepted broadcast assertion, redemption count 8, signed weekly call, and `8 redemptions` assertion. Test-only helper endpoints exist only under `NODE_ENV=test`.

- [ ] **Step 5: Write integration and operations docs**

WozTell guide records scopes `bot:sendResponses`, `bot:admin`, `api:admin`, `push:create`; test environment, Priority Group, tree/node, webhook Bearer secret, approved template payload, audience, redirect/broadcast contracts, duplicate replay. Runbook records Vercel/Neon/n8n envs, restricted/migration roles, staff bootstrap SQL, migration, fake preview, WozTell smoke, retry/cancel, credential-rotation approval gate, production gates.

- [ ] **Step 6: Add explicit credentialed smoke scripts**

Add package scripts `smoke:besttime = tsx scripts/smoke/besttime.ts` and `smoke:woztell = tsx scripts/smoke/woztell.ts`. BestTime smoke reads `SMOKE_VENUE_NAME`/`SMOKE_VENUE_ADDRESS`, calls `checkCoverage`, prints only availability/provider venue ID/matched identity, and exits 1 when unavailable. WozTell smoke requires `WOZTELL_PRIORITY_GROUP_ID` and `SMOKE_WOZTELL_MEMBER_ID`, sends the test approval node only to that member/Priority Group, prints only provider message ID, and refuses to run when `VERCEL_ENV=production`.

- [ ] **Step 7: Add CI and full verification**

Create `.github/workflows/ci.yml` with checkout v4, setup-node v4 (`node-version: 24`, npm cache), and test values for `DATABASE_URL`, Auth.js keys, allowlist, HMAC, owner-link secret, and `APP_BASE_URL`. Steps are `npm ci`, unit tests, typecheck, lint, build, `npx playwright install --with-deps chromium`, and Playwright. Provider keys remain absent so fake providers are mandatory.

Run locally:

```powershell
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Expected: all checks PASS with fake providers and no production secrets/migrations.

- [ ] **Step 8: Run credentialed test-environment smoke only after approval**

```powershell
npm run db:migrate
npm run test:integration
npm run smoke:besttime
npm run smoke:woztell
```

Expected: approved test DB migrates; both pilot venues match; WozTell sends only to Priority Group; duplicate callback creates no second promotion. Stop on any match, audience, or idempotency failure.

- [ ] **Step 9: Commit**

```powershell
git add n8n scripts src/integrations/fakes src/test tests docs/integrations docs/operations .github README.md package.json package-lock.json
git commit -m "test: verify the complete rescue engine alpha flow"
```

---

## Final Verification Gate

- [ ] Named passing acceptance test exists for every P0-1 through P0-7 requirement.
- [ ] Repository contains no live API key, DB password, phone number, WozTell member ID, or production audience ID.
- [ ] Preview/test use fake or WozTell test-environment providers.
- [ ] Daily/weekly limits count only WozTell-accepted broadcasts.
- [ ] Timeout skips; no full-auto path exists.
- [ ] Owner edits pass the same grounding validator as generated copy.
- [ ] Unknown metrics render unavailable, not zero.
- [ ] Unit, typecheck, lint, build, and Playwright pass from clean checkout.
- [ ] WozTell Priority Group smoke passes before production cutover.

## Official References

- Next.js App Router and installation: https://nextjs.org/docs/app and https://nextjs.org/docs/app/getting-started/installation
- Auth.js Next.js setup and Google provider: https://authjs.dev/getting-started/installation?framework=Next.js and https://authjs.dev/getting-started/providers/google
- Neon serverless driver: https://neon.com/docs/serverless/serverless-driver
- BestTime API: https://documentation.besttime.app/app/
- WozTell Open API and Bot API: https://doc.woztell.com/open-api-reference/ and https://doc.woztell.com/docs/reference/bot-api-reference/
- OpenCode Go endpoints/models: https://opencode.ai/docs/go
