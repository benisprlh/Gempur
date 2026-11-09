# Gempur companion service

Working alpha API and mobile web dashboard. **Participant-triggered sharing is the default.** Automatic detection sharing is available only when the operator explicitly enables private trial mode and the participant separately grants scopes for a confirmed pairing. This service does not collect phone screens, inspect financial activity, or run the Android blocker. Private detection metadata is sensitive activity data; it is not a complete browser history or proof of intentional gambling.

## Run locally

Requires Node.js 24. No npm packages or install step are needed.

```sh
cd server
npm test
npm start
```

Open <http://127.0.0.1:8080>. The default SQLite database is `server/data/gempur.sqlite` when launched from this directory. Do not commit the data directory or copy it into a public web root.

For the Android Emulator, the debug client can reach the host loopback service at `http://10.0.2.2:8080`. With no `PUBLIC_ORIGIN`, the server accepts the exact `10.0.2.2` Host authority only when the actual TCP peer is loopback (`127.0.0.1`, `::1`, or IPv4-mapped loopback). Other hosts remain rejected; `X-Forwarded-For` and `X-Forwarded-Host` are never trusted to grant this exception. This does not enable remote HTTP binding or relax the HTTPS production-origin requirement.

The browser stores its capability only in an HttpOnly, SameSite=Strict cookie. It is not saved to localStorage. Native clients receive the token once at registration and must encrypt it on the device. Accounts/sessions expire after 30 days; recovery and token rotation are not implemented in this alpha. Losing the session means creating a new identity and pairing again. This is an explicit production release blocker, not a claim of account maturity.

## Remote deployment

```sh
HOST=0.0.0.0 PORT=8080 PUBLIC_ORIGIN=https://your-owned-host.example DATA_DIR=/private/gempur-data node index.mjs
```

The placeholder origin is not a deployed service. A remote bind requires an HTTPS public origin and a TLS reverse proxy controlled by the operator. Keep the raw HTTP process behind that proxy/private network. Configure the real origin exactly, without trailing slash. The API has no wildcard CORS. Browser changes require a same-origin request plus `X-Gempur-Client: web`; native changes use bearer authorization.

Use an encrypted data volume, restrictive operating-system permissions, protected backups, HTTPS, process supervision, monitoring of availability (without sensitive request contents), and an externally reachable private support/deletion contact before production. Database row deletion is not cryptographic erasure: SQLite WAL, filesystem snapshots, and backups require operator lifecycle handling. Do not direct private deletion/account requests to public GitHub Issues.

This server is single-process by design. In-memory rate limiting is local to that process; do not run multiple replicas without shared rate controls and a compatible database design. Do not trust unvalidated forwarded client-IP headers.

## Authentication and pairing

All successful JSON payloads below are wrappers shown literally. All errors use `{ "error": { "code": "...", "message": "..." } }` and a relevant HTTP status. Times are ISO-8601 UTC. API writes accept JSON bodies up to 8 KiB and reject undeclared fields.

1. `POST /api/devices {role: "participant" | "companion", name: "Nickname"}` → `{device:{id,role,name},token,expiresAt}`. Register only identities authorized by the actual person. Use `Authorization: Bearer <token>` for subsequent native requests. Do not log the token.
2. Participant: `POST /api/pairings {}` → `{pairingId,invitationCode,expiresAt}`. The random 256-bit invitation is one-use and expires in 10 minutes. The raw invitation is not retained server-side.
3. Companion: `POST /api/pairings/claim {invitationCode}` → `{pairingId,verificationCode,participant,expiresAt}`.
4. Compare participant/companion names and verification code through an independent conversation.
5. Participant: `POST /api/pairings/:id/confirm {verificationCode}` → `{pairing}`. No data access is activated before this step.
6. Either party: `DELETE /api/pairings/:id` revokes access, deletes snapshots and support messages, and cancels exception permits. There is no waiting period for consent revocation.

`GET /api/me` returns `{device,pairings:[{id,status,participant,companion,createdAt,expiresAt,consentVersion,verificationCode?}]}`. `expiresAt` is the invitation deadline, not an expiry of an already-active consent grant. `verificationCode` is available only while claimed, to the authorized two parties. There is at most one live invitation or active pairing per participant. An expired or revoked pairing can be replaced with a new invitation.

## Explicit sharing

- Participant: `POST /api/snapshots {pairingId,protection:"active"|"inactive"|"unknown",rulesVersion,blockedRequests,observedAt}`. This must be triggered after a visible local preview/confirmation, not sent on every application launch or background event. `blockedRequests` is a network counter, not a count of bets. Observations must be within the last 24 hours.
- Participant: `POST /api/support {pairingId,message:"call"|"message"|"company"}`. A successful response means **received by the server**, not delivered as a push or read by a human. No push provider is implemented. The dashboard must be refreshed/opened to see new messages. Requests expire after 15 minutes.
- Companion: `GET /api/pairings/:id/dashboard` → `{pairing,snapshot,supports,exceptions,notice}`.
- Participant: `GET /api/pairings/:id/activity` → the same shape for their own shared data and request states.
- Companion: `POST /api/support/:id/read {}` records an explicit read acknowledgement. It does not certify that help was provided.

The browser never fabricates device measurements: snapshots are sent by the Android client using the state it can actually measure. The dashboard labels every snapshot as past information, not live protection.

## Private APK trial: separately opted-in automatic detection sharing

The ordinary server starts with this capability **off**. The owner selected a separate private APK trial; enabling the server does not enable automatic monitoring in an ordinary Android debug/release build. Private mode is not a claim of Google Play eligibility or a completed two-phone deployment.

```sh
GEMPUR_PRIVATE_MONITORING=true node index.mjs
```

The value must be exactly `true`; omission or any other value keeps the capability off. `GET /api/health` reports `privateMonitoringEnabled`. Private routes return 404 when off. Every confirmed pairing starts with `{enabled:false,version:0,scopes:[],updatedAt:null}` and therefore remains manual after an existing database is upgraded.

- Participant: `PUT /api/pairings/:id/automation {enabled:true,scopes:["domain","app"]}` → `{automation:{enabled,version,scopes,updatedAt}}`. Enable with a nonempty subset, no duplicate scopes. Disable with `{enabled:false,scopes:[]}`. Actual enabled/scope changes advance the separate grant version, delete retained detections and cancel detection-linked corrections; an identical retry is idempotent. Pairing `consentVersion` is separate from this `automation.version`.
- Current pair members: `GET /api/pairings/:id/automation` returns that grant. Pairing views include `automation` only when private capability is enabled.
- Participant: `POST /api/detections {pairingId,consentVersion,automationVersion,events:[{eventId,kind,target,reason,verdict,action,occurredAt,count}]}` → `{acceptedEventIds:[...]}`. `eventId` is a UUID; `kind` is `domain` or `app`. Accepted reason/verdict pairs are `known_rule`/`known`, `personal_rule`/`personal`, `name_heuristic`/`suspected`; action is `blocked` or `flagged`. App package case is preserved. Domains are normalized as IDN/ASCII. The current active pairing, authentication, grant version and scopes are checked after the request body is consumed.
- Each batch contains 1–10 events; count is 1–1000. `occurredAt` is ISO-8601 UTC, within the last 24 hours with at most 60 seconds of future clock tolerance. URLs, paths, queries, labels, inventories, screenshots, unknown fields, invalid package names and diagnostic/reserved synthetic targets are rejected. The private service suppresses diagnostic fixtures locally too.
- Client event IDs are unique per pairing. Retry a frozen payload with the same ID; reusing an ID with changed count/target/time or other event fields returns 409. Uploads are limited to 30 batches per minute per pairing in addition to ordinary process/IP/device limits.
- Current pair members: `GET /api/detections?pairingId=...` → `{detections:[{id,eventId,kind,target,reason,verdict,action,occurredAt,receivedAt,count,readAt}],automation}`. Returns at most the latest 100 records. A disabled grant returns no detections. Only the companion may `POST /api/detections/:id/read {}`; its `{detection}` response records an explicit read acknowledgement, not merely polling or push delivery.
- Storage holds at most 500 retained detections per pairing. A batch that would exceed the cap fails atomically with HTTP 429 and `error.code="storage_full"`; existing IDs can still be retried idempotently. The server does not evict and reinsert old IDs during retry. Local blocking remains independent. Clients must show a bounded pending/error status and back off rather than promise all alerts were delivered.
- Detections expire after seven days, purged on subsequent server requests. Idempotency lasts while the record is retained; after seven days the original event is already outside the 24-hour upload window. Revoke/logout/delete removes detections and disables grants; disabling sharing or changing scopes also deletes detections. Data already seen or copied cannot be recalled.

Private export includes the authenticated owner's authorized grant and detections, without capability tokens. Export/deletion remain available if an operator later disables private mode. Database migration adds columns/tables while preserving existing identities, pairings and corrections.

The server has **no FCM/Web Push provider**. Private native companion clients poll an active confirmed pairing in a visible user-started service; the web inbox refreshes only while open. Server acceptance is not notification delivery, and a read acknowledgement is not evidence help was provided. Remote use still requires an operator-owned HTTPS backend and real device/network validation.

These events are assertions by an authenticated client, not tamper-proof evidence that a user intentionally opened a gambling site or that every app/browser is protected. Do not use the data as a verified abstinence or transaction record.

## False-positive correction protocol

Corrections are only for a normal domain incorrectly blocked, never an approval to gamble or a global disable command. There is no remote app-control channel.

1. Participant: `POST /api/exceptions {pairingId,target:"example.org",reason:"false_positive"}` → `{exception}`. `targetKind` defaults to `domain`. Private mode also accepts `targetKind:"app"` for one package and optional `detectionId`, which must match an accessible retained detection's exact target and kind; diagnostic targets cannot be allowed.
2. Companion: `POST /api/exceptions/:id/decision {decision:"approve"|"deny"}` after reviewing the target.
3. Participant: `GET /api/exceptions/:id` checks state and ready time.
4. After the 10-minute cooldown: `POST /api/exceptions/:id/permit {}` → `{permitToken,exception,consentVersion}`. The raw permit is issued only once.
5. Participant: `POST /api/exceptions/:id/apply {permitToken}` → `{exception,target,targetKind,expiresAt,notice}`. The client must confirm locally, check its own current consent, and apply only that target until expiry. Ordinary builds reject known trusted gambling targets; a private trial may narrowly correct one trusted-feed false positive after companion review. Approval is not proof of safety and cannot globally disable filtering. A successful API response alone does not modify local rules.

The correction expires 30 minutes after the cooldown ends. Permits are target-bound through the server record, one-use, account-bound, and invalid after revocation. All mutable state is checked after the request body is consumed, so delayed bodies cannot preserve authorization across revocation. The API is synchronous between state validation and database update.

If a client loses an issued permit before applying it, it cannot retrieve the same secret again; re-requesting a correction is required in this alpha. Do not weaken single-use semantics to recover a missing permit silently.

## Explicit domain reports

Participant: `POST /api/reports {target:"example.org"}` → `{report:{id,target,status:"pending",createdAt},notice}`. The client must show the normalized domain in a preview and require deliberate Send. Only the domain is accepted: full URLs, private notes, path/query parameters, and undeclared fields are rejected. Reports are rate-limited to five per day per participant and are never activated as global rules automatically.

`GET /api/reports` returns only the authenticated author's `{reports:[...]}`. Reports are included in that author's export, retained for up to 14 days, and cascade-deleted with the account. Reviewing/curating the reports is an operator responsibility; there is no public admin endpoint or automatic website visit.

## Privacy and lifecycle

- `GET /api/me/export` exports authorized shared data without authentication secrets.
- `DELETE /api/me` immediately deletes the account and associated pairing data from the active database.
- `DELETE /api/session` revokes all live pairings, invalidates the device capability, and clears the browser cookie. This avoids stranding a participant with a live sharing grant after losing their only session. Account metadata follows its existing retention; use account deletion to delete the active account row.
- Snapshots, support requests, and corrections are retained for up to 14 days and purged when subsequent requests are processed. An idle server has no background janitor in this alpha.
- Disabling a client locally cannot instantly notify an offline server. The Android client must stop queueing data immediately and send revocation first upon reconnecting.
- No access logs, analytics SDK, external font/CDN or screenshot capture are included. Default mode has no automatic detection upload. Private sharing may upload individually detected domain/package metadata under its separate grant; do not describe this sensitive data as anonymous or as proof of user intent.

## Verification

`npm test` runs security and lifecycle integration checks including pairing expiry and replay, role isolation, typed snapshot input, support expiry, consent revocation, exception cooldown and replay, cross-target permit misuse, account deletion, retention, CSRF/origin defenses, malformed/oversized bodies, rate limits, concurrent permit replay, and revocation while an exception request body is delayed.

Private integration checks additionally cover default-off capability, unchanged/manual upgrades, explicit scopes and versions, strict metadata validation/diagnostic rejection, idempotency conflicts, cross-pair access, read acknowledgement, revoke/logout/grant changes during incomplete uploads, typed event-bound approval, seven-day retention, the atomic 500-record cap, upload rate bounds and preservation of legacy database corrections.

These tests do not prove hosting readiness, mobile-network reliability, clinical effectiveness, Play Store acceptance, or that every real-world gambling domain is blocked.
