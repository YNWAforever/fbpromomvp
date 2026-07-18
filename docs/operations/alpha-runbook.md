# Alpha operations runbook

Use this runbook for the off-peak rescue engine alpha only. A production cutover requires an explicit approval gate after every item below is evidenced in the test environment.

## 1. Provision and restrict access

Vercel holds application runtime variables; Neon holds application data; n8n holds only the n8n endpoint and the matching `N8N_HMAC_SECRET`. Configure the same non-production values for `DATABASE_URL`, `AUTH_SECRET`, Google OAuth keys, `ADMIN_EMAILS`, `N8N_HMAC_SECRET`, `OWNER_LINK_SECRET`, `APP_BASE_URL`, BestTime settings, WozTell test-environment settings, and OpenCode Go test settings.

Use a restricted application database role for runtime reads/writes. Keep a separate migration role in `MIGRATION_DATABASE_URL`; it is used only by an approved migration operator and is never exposed to Vercel or n8n. Do not use an owner credential for the running app.

## 2. Migrate and bootstrap staff

After the migration role and target database have been confirmed, run:

```powershell
$env:MIGRATION_DATABASE_URL = "postgresql://migration-role:..."
npm run db:migrate
```

Bootstrap an allowlisted staff record only if an operator needs it before the first Google sign-in:

```sql
INSERT INTO staff_users (email, name, active)
VALUES ('ops@example.com', 'Alpha operator', true)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, active = true;
```

Keep `ADMIN_EMAILS` synchronized with the approved staff list. Deactivate rather than delete a departed operator.

## 3. Verify fake preview before real integrations

Deploy a preview with no real provider keys. Run the unit suite, browser lifecycle, and a staff dashboard walkthrough using fake BestTime, WozTell, and OpenCode Go providers. The lifecycle must show a confirmed venue match, two signed monitor calls, one approval, one accepted broadcast, eight redemptions, and a weekly report with `8 redemptions`.

Import the committed n8n workflows into the test n8n workspace. Set their base URL and HMAC secret through n8n credentials/environment settings, never by editing the committed JSON. Confirm hourly retry/cancel behaviour: a failed request waits five seconds, retries three times (four total attempts), then reaches the alert destination with the preserved run context. Cancel a running execution only after recording its run ID and confirming whether the application claimed the idempotency key.

## 4. Credentialed test smoke

After a change ticket approves the test-environment send, run:

```powershell
$env:SMOKE_VENUE_NAME = "Approved pilot venue"
$env:SMOKE_VENUE_ADDRESS = "Approved pilot venue address"
npm run smoke:besttime

$env:SMOKE_WOZTELL_MEMBER_ID = "approved-test-member"
npm run smoke:woztell
```

Stop immediately if BestTime cannot match the venue, if WozTell cannot prove the Priority Group and member isolation, or if a replay causes a second promotion. Do not run the WozTell smoke when `VERCEL_ENV=production`.

## 5. Rotation and production gates

Credential rotation is an approval gate: obtain written approval, create a replacement secret/token, update Vercel and n8n atomically, validate one test execution, then revoke the old credential. Never rotate production secrets as part of an ordinary deployment.

Before production is enabled, an approver must sign off on all of the following:

- database migration completed with the migration role and rollback plan recorded;
- staff allowlist and active users reviewed;
- BestTime pilot matches verified and manual matching retained;
- WozTell production channel/environment/tree/node/Priority Group verified separately from alpha;
- WozTell callback Bearer secret, test replay evidence, and audience isolation reviewed;
- n8n HMAC signing, retry/alert/cancel procedure, and a weekly report delivery verified;
- no production credentials appear in CI, committed files, logs, test fixtures, or preview environments.