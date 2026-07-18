# Off-peak rescue engine

Staff use the dashboard to verify a BestTime venue match, approve grounded promotion copy in WozTell, and review weekly redemption results. n8n submits the signed hourly monitor and weekly report jobs from the versioned exports in `n8n/workflows/`.

## Local verification

```powershell
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The unit and browser suites use fake providers; do not add real BestTime, WozTell, or OpenCode Go credentials to CI.

## Credentialed test-environment probes

The smoke probes are opt-in. They are for an approved non-production environment only and never print credentials or provider payloads.

```powershell
$env:SMOKE_VENUE_NAME = "Pilot venue name"
$env:SMOKE_VENUE_ADDRESS = "Pilot venue address"
npm run smoke:besttime

$env:SMOKE_WOZTELL_MEMBER_ID = "test-member-id"
# WOZTELL_PRIORITY_GROUP_ID and all WozTell test-environment settings must already be present.
npm run smoke:woztell
```

`smoke:woztell` refuses `VERCEL_ENV=production`. Follow the audience and cutover controls in [the WozTell alpha guide](docs/integrations/woztell-alpha.md) and [operations runbook](docs/operations/alpha-runbook.md).