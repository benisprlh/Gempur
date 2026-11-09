# Gempur companion service

Working alpha API and mobile web dashboard for **participant-triggered sharing**. This service does not monitor browser activity, collect phone screens, inspect financial activity, or run the Android blocker.

## Run locally

Requires Node.js 24. No npm packages or install step are needed.

```sh
cd server
npm test
npm start
```

Open <http://127.0.0.1:8080>. The default SQLite database is `server/data/gempur.sqlite` when launched from this directory. Do not commit the data directory or copy it into a public web root.

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

## False-positive correction protocol

Corrections are only for a normal domain incorrectly blocked, never an approval to gamble or a global disable command. There is no remote app-control channel.

1. Participant: `POST /api/exceptions {pairingId,target:"example.org",reason:"false_positive"}` → `{exception}`.
2. Companion: `POST /api/exceptions/:id/decision {decision:"approve"|"deny"}` after reviewing the target.
3. Participant: `GET /api/exceptions/:id` checks state and ready time.
4. After the 10-minute cooldown: `POST /api/exceptions/:id/permit {}` → `{permitToken,exception,consentVersion}`. The raw permit is issued only once.
5. Participant: `POST /api/exceptions/:id/apply {permitToken}` → `{exception,target,expiresAt,notice}`. The client must confirm locally, check its own current consent, ensure the target is not a known gambling domain, and apply only that target until expiry. A successful API response alone does not modify local rules.

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
- No access logs, analytics SDK, external font/CDN, screenshot capture, or automatic browsing-history upload are included.

## Verification

`npm test` runs security and lifecycle integration checks including pairing expiry and replay, role isolation, typed snapshot input, support expiry, consent revocation, exception cooldown and replay, cross-target permit misuse, account deletion, retention, CSRF/origin defenses, malformed/oversized bodies, rate limits, concurrent permit replay, and revocation while an exception request body is delayed.

These tests do not prove hosting readiness, mobile-network reliability, clinical effectiveness, Play Store acceptance, or that every real-world gambling domain is blocked.
