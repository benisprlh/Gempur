# Private automation contract — 9 November 2026

Owner chose a private APK trial for automatic detection/sharing. This supersedes the manual-only baseline only in a separately compiled `privateDebug` build. Ordinary debug/release keep automatic adult monitoring disabled. This is not a promise of Play eligibility, universal classification, or device validation.

## Scope and consent

- Local known-domain filtering already works automatically. Private trial may offer explicitly opt-in name-based **suspected** advisory review, separate from known-rule classification. Unknown stays unknown; no claims to read encrypted content.
- Private app-name/package analysis is heuristic, not proof of gambling. Name-only findings are flagged for review and never interrupt an app or disconnect DNS; critical/system apps stay excluded. No screen text/content, screenshots, chats, SMS, OTP, contacts or location.
- Automatic sharing is a second opt-in, bound to a confirmed pairing and separate automation grant version. Only detection target (domain/package), reason/verdict/action, timestamp bucket and coalesced count leave the device. No full URLs, query/path, general history, inventory upload or foreground-app stream. A matched connection is not evidence of intentional gambling.
- Stop/revoke remains available to the participant. No hidden operation or uninstall prevention. Local protection works when the backend is offline.

## Server contract (private mode default OFF)

`createApp({privateMonitoringEnabled:false})`; operator opt-in `GEMPUR_PRIVATE_MONITORING=true`. Health returns `privateMonitoringEnabled`. Private routes require this flag.

- `PUT /api/pairings/:id/automation` participant JSON `{enabled:boolean,scopes:["domain","app"]}`; scopes can be a nonempty subset when enabling. Returns `{automation:{enabled,version,scopes,updatedAt}}`. Every change advances version; disabling deletes detections. GET on the same path allows the pair's current members. Pairing views include automation when private mode is enabled.
- `POST /api/detections` participant JSON `{pairingId,consentVersion,automationVersion,events:[{eventId,kind,target,reason,verdict,action,occurredAt,count}]}`. Batch1..10; eventId UUID; kind domain/app; reason known_rule/personal_rule/name_heuristic; verdict known/personal/suspected; action blocked/flagged. Normalize targets; reject URL/path/query, diagnostic/reserved synthetic targets and unknown fields. Time limited to last24h + clock tolerance. Recheck current pairing/auth/grant after awaited body. Deduplicate on pair/client event ID; cap count and retention/batch/rate/storage. Return `{acceptedEventIds:[...]}`. No label or device inventory upload.
- `GET /api/detections?pairingId=...` current pair member returns `{detections:[{id,eventId,kind,target,reason,verdict,action,occurredAt,receivedAt,count,readAt}],automation:...}`; at most100. Disabled grant returns no past detections. Max500 records/pair and7-day retention. `POST /api/detections/:id/read` companion-only with `{}`.
- Existing exceptions accept optional `targetKind` (domain default, app only private mode), optional `detectionId` binding exactly to an accessible detection's target/type. Existing clients remain compatible. Include targetKind in exception and apply views. Retain exact target binding, one-use permit,10min cooldown,30min TTL and revocation semantics. Private domain false-positive approval may narrowly override a trusted-feed match; diagnostics cannot be allowed. Companion approval is not evidence the target is safe. No global unlock.
- Revoke/logout/delete clears automatic grants/events as well as existing state. Export includes private data for its owner. No automatic public hosting or live production credentials.

## Android boundary and shared interfaces

`BuildConfig.PRIVATE_BUILD` false by default; privateDebug true, separate `.private.debug` ID, private-only manifest services and targeted MAIN/LAUNCHER package queries. No variant requests QUERY_ALL_PACKAGES. App scanning is limited to visible launchable apps, not headless/all installed packages. Automatic behavior is never activated by a server flag in the ordinary build.

`PrivateMonitoring` is the shared facade (Android service/storage owner):

```java
static void record(Context c,String kind,String target,String reason,String verdict,String action);
static void start(Context c); // user action only; starts visible private foreground service
static void stop(Context c);
static boolean localEnabled(Context c);
static void setLocalEnabled(Context c,boolean enabled);
static JSONObject sharing(Context c); // enabled,pairingId,consentVersion,automationVersion,scopes
static void enableSharing(Context c,String pairingId,int consentVersion,int automationVersion,JSONArray scopes);
static void disableSharing(Context c); // immediate queue invalidation
static JSONArray events(Context c); // bounded encrypted local detection inbox
static void clear(Context c);
```

Sharing config/event queue live in a separate encrypted, process-locked, reload-before-write store. Account LocalStore also uses process-locked fresh transactions to preserve concurrent UI changes; the background service only reads account context. Atomically snapshot endpoint/token/role and pin each request to that context to avoid cross-origin credential/payload mixing. Recheck local revocation/grant before dispatch. Queue TTL24h, bounded100 records, coalesce same target/reason/action per5min; skip synthetic test targets. Existing pairings remain manual after upgrade. Never replay old events to a new pairing/grant.

Stopping stores a durable pending server-off marker, preserving pairing, origin, account, grant version and a revocation UUID. Matching server acknowledgement alone clears it. Local stop is immediate; server revocation and deletion are not claimed while offline or when the private endpoint is unavailable. A new grant cannot be enabled while an old server-off is unresolved. Local private-history deletion preserves this marker.

Private service uploads scoped queued events and, for companion-role accounts, polls a confirmed active pairing every30s. Companion notifications are generic on the lock screen, permission-aware, visible user-started foreground polling—not FCM/Web Push and not guaranteed instant/background delivery. Persist dedup IDs; do not label a poll as delivery/read. Tapping opens the authenticated app; no tokens in links. Backoff offline; cancel on revoke/logout/off. Foreground service is declared only for privateDebug.

Detection engine owner exposes `DetectionPolicy.Decision {boolean blocked; String reason,verdict;}` for local domain and app decisions, plus `RuleRepository.evaluate(Context,String)` for DNS integration. Ordinary build behavior must stay equivalent to existing rules. Private local opt-in controls advisory name review. Existing exact temporary allowance applies before heuristic decisions and stays exact/short-lived. App observation uses only window package events and explicit Accessibility opt-in; no broad content retrieval. App scanning stays local; only individually detected targets can be shared.

## Acceptance

Test default-off/manual upgrade, known/personal/suspected/unknown separation, benign controls, diagnostic suppression, dedup/idempotency, scopes and grant versions, cross-pair rejection, revoke-during-upload, stale/offline TTL, no URL/inventory payloads, atomic private storage, exact typed approval/replay/expiry, and critical-app exclusions. Compile and lint normal plus private build; verify default release manifest lacks private permissions/services. No emulator/HP claim until actually run. Device validation and HTTPS backend remain necessary before real two-phone use.
