# WozTell alpha integration

This alpha uses a dedicated WozTell test environment and test Priority Group. It must never share a channel, tree, node, environment, or audience identifier with production.

## Access and test environment

Request only these scopes for the alpha app: `bot:sendResponses`, `bot:admin`, `api:admin`, and `push:create`.

Create and record separate, non-production values for:

- the WozTell test environment and `WOZTELL_ENVIRONMENT_ID`;
- a dedicated Priority Group and `WOZTELL_PRIORITY_GROUP_ID`;
- the approval-flow tree and node (`WOZTELL_TREE_ID`, `WOZTELL_NODE_ID`);
- the alpha channel (`WOZTELL_CHANNEL_ID`) and app (`WOZTELL_APP_ID`);
- `WOZTELL_NON_PRODUCTION_AUDIENCE_IDS` containing every one of those test identifiers (or a dedicated `WOZTELL_NON_PRODUCTION_AUDIENCE_PREFIX`);
- the API access token and `WOZTELL_WEBHOOK_SECRET`.

Set `VERCEL_ENV=preview` or `test` for every non-production sender. The application fails closed if the Priority Group or positive test-audience allowlist is absent, opaque identifiers are not explicitly allowlisted, or a production-looking identifier is supplied.

## Approval-node contract

The app redirects exactly one configured test member into the configured approval node. The Bot API request uses the WozTell redirect-to-node endpoint with `executeActions`, `executeConditions`, and `executeRules` enabled. Its approved template payload is:

```json
{
  "meta": {
    "approvalId": "<approval UUID>",
    "venueId": "<venue UUID>",
    "expiresAt": "<ISO timestamp>",
    "candidates": [
      { "id": "<candidate UUID>", "body": "<approved promotion copy>" }
    ],
    "ownerLink": "<optional signed staff link>",
    "requestKey": "<optional idempotency key>"
  }
}
```

Production promotion copy is accepted only after a staff member chooses one candidate. For alpha, the audience is the dedicated Priority Group only; the smoke probe additionally requires `SMOKE_WOZTELL_MEMBER_ID` and emits one test approval-node redirect to that member. `npm run smoke:woztell` refuses `VERCEL_ENV=production` and prints only the provider message ID.

## Callback, broadcast, and replay contract

Configure the WozTell webhook as `POST /api/webhooks/woztell` with `Authorization: Bearer <WOZTELL_WEBHOOK_SECRET>`. Do not put the secret in a query string or logs.

The callback must identify the approval/event and selected candidate. Valid, in-window approval causes a broadcast request only to the configured audience reference. The Open API request records the provider broadcast receipt; the app treats acceptance as a provider acknowledgement, not proof of delivery.

WozTell may replay a callback. Send an identical replay in the test environment and verify it returns successfully without a second promotion or broadcast. Treat a missing, mismatched, expired, or duplicate idempotency key as an incident: cancel/retry only after the stored approval and audit trail have been reviewed.