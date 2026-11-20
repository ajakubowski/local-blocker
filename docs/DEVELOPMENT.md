# Development notes

## Architecture

- `extension/core/policy.js`: domain normalization; weekly policy evaluation; complete-week weakening comparison; next transitions; pure DNR compilation.
- `extension/core/backup.js`: versioned policy-only export/import validation, with a 1 MB import cap.
- `extension/core/password.js`: native Web Crypto password derivation and verification.
- `extension/background.js`: validated message boundary, one serialized operation queue, authorization, durable state, rule application, alarms, and matching-tab replacement.
- `extension/ui`: DOM-only UI modules. No framework, inline scripts, remote assets, content scripts, or network client.

The source extension is directly loadable. Node and Playwright are only for checks, tests, and packaging.

## Local schema and messages

`state.version = 1` contains a configuration `revision`, `settings` (`groups`, `cooldownMinutes`, `visitMinutes`), stable `sites` mapping UUIDs to canonical domains, a password `verifier`, optional `pending` proposal, and optional `visit`.

Groups contain `id`, `name`, `domains`, `mode` (`always` / `scheduled`), `windows` (`days`, `start`, `end`), and `allowTemporaryVisits`. Days use JavaScript weekday numbers (Sunday 0). Times use local minutes after midnight. Schema validation rejects unknown modes, malformed domains, invalid ranges, duplicate group IDs, and excessive rule counts.

Messages: `status`, `setup`, `unlock`, `lock`, `propose`, `confirm`, `cancelPending`, `changePassword`, `exportSettings`, `requestVisit`, `startVisit`, `cancelVisit`, `openSettings`, and `openRegular`. Every response is `{ok:true,data}` or `{ok:false,error}`. Only bundled top-level extension pages may send commands; settings mutations additionally require the options page and a document-bound unexpired token. Incognito may query state or open regular-window controls, but does not mutate shared state. No external messaging listener exists.

UI clocks only display deadlines. The worker checks its own current time and the saved state before granting anything. A configuration revision prevents stale windows from overwriting newer settings. Any effective configuration change cancels visits and invalidates pending edits. Password changes clear authentication and pending proposals. Pending confirmation also requires that authorization was issued after the proposal deadline. Backups never bypass the worker: imports are local drafts subsequently sent through the same `propose` path.

## Rule application and recovery

Active restrictions compile into persistent dynamic rules. Permission-free block rules remain installed underneath higher-priority custom redirects, so loss of website access does not intentionally remove blocking. No-exception rules take precedence over session-scoped visit allowances. Dynamic updates are atomic within Chrome; session allowances are revoked before restrictions are changed and added last.

Configuration commits write a transaction journal, install the new rules, save state, and clear the journal. On a failure, the last state/rules are restored; on worker startup, unfinished transactions roll back. The incognito worker waits for journal completion before reconciling shared policy. Chrome storage and rules are separate APIs, so there is no cross-API atomic transaction; the journal supplies crash recovery.

Reconciliation runs at schedule/visit boundaries, every 30 seconds, on startup, permission changes, relevant tab activity, window focus, and UI queries. Open-tab sweeps run on boundary/policy changes and periodic alarms. Existing rules continue working when the worker sleeps. Visit allowances use session rules, so a restart removes them until the worker checks the persisted deadline. Alarms are recreated on every worker startup.

Schedule comparison checks the whole week for each domain represented in either configuration, including inherited parent-domain coverage. It also compares no-visit coverage. This prevents an inactive-hours edit or a domain move from bypassing the cooldown. Next transitions walk real clock minutes to handle daylight-saving skipped/repeated times.

## Tests

`npm test` runs native Node tests for policy, cryptography, and the worker against a deterministic Chrome API harness. It covers negative authorization paths, stale revisions, clock boundaries, cancellation, crash recovery, and failed DNR installs.

`npm run test:browser` uses Playwright Chromium with isolated persistent profiles and local `.blocker.test` fixture sites. Most browser fixtures pre-grant only test domains in a **temporary copy** of the manifest, avoiding native permission dialogs during automated tests. The permission-free suite uses the unchanged manifest. These fixture permissions are never packaged. Tests accelerate long waits by editing the isolated test profile’s storage through DevTools; production code contains no test clock or bypass.

The browser suite writes screenshots using example domains and a disposable test password. Never point these tests at a personal Chrome profile. A sandbox may require approval to launch Chromium or bind a local server.

Test profiles enable Developer mode so Chrome can reload unpacked extensions when incognito access changes. The permission-revocation and incognito tests use Chrome's own extension-management APIs inside the isolated `chrome://extensions` page to change the test installation's access. The offline-page fixture treats only its local HTTP origin as secure so its test service worker can run. These controls do not appear in the shipped extension.

## Real-time acceptance and Store assets

Run `RUN_REALTIME=1 npm run test:browser -- realtime.spec.js` for a real ten-minute wait followed by a five-minute visit. No stored deadlines or clocks are modified; extension pages close during the wait and visit so normal alarms/worker startup enforce them. The standard suite skips this long test.

Run `npm run test:browser -- store-assets.spec.js` to regenerate 1280×800 screenshots from the real UI and the code-drawn promotional PNGs/SVGs. Example settings are used; these are never screenshots of a personal profile.

GitHub Actions runs checks and the standard browser suite on Ubuntu with Node 24 and publishes ZIPs as workflow artifacts. `npm audit` checks development dependencies; the runtime has none.

## Release

1. Run unit tests, source/manifest checks, and browser tests.
2. Complete native Chrome smoke checks described in `docs/VALIDATION.md`.
3. Update the version in the manifest and package metadata together.
4. Run `npm run package` to produce runtime, Web Store, and source ZIPs plus checksums.
5. The runtime ZIP places `manifest.json` at its root. It includes installation/privacy/license documentation but no test code, dependencies, saved state, or runtime secrets.

The `-webstore.zip` contains runtime files only. Listing and reviewer material is in `docs/store`. A Web Store release is not performed by the build scripts. Future schema versions must migrate existing state rather than silently resetting passwords, schedules, or deadlines.
