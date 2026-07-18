# Task 6 final fix report

## Scope

Closed the three remaining Task 6 rereview findings without using live credentials or provider resources:

- WozTell preview/test sends now fail closed unless every audience identifier is covered by an explicit non-production allowlist or explicit test prefix, and a non-production environment plus Priority Group are configured. Stable approval request keys are included in provider metadata.
- Migration-upgrade coverage now includes migration 0003_worthless_hammerhead, its journal entry, SQL, and snapshot assertions.
- Approval send failures retry from send_failed using the existing approval/candidate rows and the same deterministic request key. Provider acceptance is recorded with an idempotent accepted-state audit key when local persistence fails; later invocations reconcile the provider message ID and requested audit without sending again.

## Verification

- npm.cmd run test -- src/integrations/woztell/bot-client.test.ts src/application/approvals/create-approval.test.ts src/db/migration-upgrade.test.ts — 3 files, 16 tests passed.
- npm.cmd run test — 23 files passed, 1 skipped; 103 tests passed, 2 skipped.
- npm.cmd run typecheck — passed.
- npm.cmd run lint — passed.
- npx.cmd drizzle-kit check with disposable placeholder migration URL — Everything's fine.
- npm.cmd run build with disposable preview configuration — passed.
- git diff --check — passed.

Task 7 was not started.