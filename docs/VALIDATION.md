# Release validation — 1.1.0

Date: November 20, 2026

## Completed

- **34 unit/worker tests passed** with Node 24.14.1 on macOS arm64.
- **20 browser tests passed** with Playwright 1.58.2 and its bundled Chrome for Testing 145.0.7632.6, using isolated profiles (19 behavior/layout tests plus one Store-asset render test).
- **Source/manifest checks passed:** all 17 extension files, JavaScript syntax, expected permissions, resource paths, no remote assets, no network client APIs, no cloud-sync calls, and no unsafe HTML assignment.
- `npm audit --audit-level=moderate` reported **0 vulnerabilities**. Dependencies are development-only.
- Store screenshots (1280×800), a 440×280 promotional tile, and a 1400×560 marquee were generated locally. The settings, schedules, blocked page, and small promotional tile were visually inspected.
- **Ordinary Chrome update verified:** reloaded the existing unpacked installation through Google Chrome 158.0.8127.36's extension details. Chrome displayed version 1.1.0, enabled, without an error indicator. The options page opened with the existing saved group, timings, website grants, and password lock intact. Export/import controls appeared and remained locked. No user password was entered or changed, and no personal configuration was added to the source or screenshots.

## Coverage

Policy tests cover normalized URLs and international domains, exact/subdomain matching, lookalikes, weekly/overnight schedules, overlaps, DST skips/repeats, timezone changes, full-week weakening comparisons, and stable site IDs.

Worker tests cover authentication and its expiry, document/tab binding, password rejection/throttling/change, concurrent requests, full cooldown preservation, post-deadline fresh authentication, stale proposals, strict groups, cancellation, missed ready windows, expired visits on startup, journal recovery, failed rule installs and rollback, incognito mutation rejection, and credential-free exports.

Browser tests exercise actual DNR enforcement for new/existing tabs, subframes, stricter subdomains during a parent visit, unrelated websites, trailing-dot domain aliases, permission denial/revocation, cached service-worker pages, Back navigation, visit expiry/cancellation, worker suspension, restart, extension reload, split-incognito shared visits, and a real schedule boundary while the settings page is closed. Migration tests download/import real JSON through the UI and verify that weaker imports remain pending. Invalid backups are rejected without applying changes.

A privacy test observes no external requests during setup, editing, blocked-page/popup display, visit request/start/cancellation, and settings changes. A separate intentional test fetch is rejected by the runtime CSP with a connect-src violation. Static checks supplement this behavioral audit; this is not a formal security assessment.

Most long waits in the standard suite are accelerated by changing **only isolated test-profile state** through DevTools. Production runtime files contain no test-clock override or bypass. **The opt-in real-clock acceptance test passed in 15.0 minutes:** a real ten-minute wait survived closing the extension pages, access required an explicit start, the worker granted a five-minute visit, and the open matching tab was automatically replaced on expiry. No clock or stored deadline was changed in this test. This brings local browser coverage to 21 passing checks including the long acceptance test.

## Limits and checks after Store enrollment

Physical computer sleep/wake was not induced. Durable deadlines, overdue reconciliation, browser restart, and worker suspension are covered. Chrome may still delay alarms after wake or startup.

Version 1.1.0 was uploaded and submitted for Chrome Web Store review on November 23, 2026. The Store ID is `abilljcfainmokckafdipfjcpicmdgnj`. Google confirmed receipt; review is pending, visibility is Unlisted, and automatic publishing is disabled. Before uploading, the ZIP checksum and exact correspondence to the 17 tested runtime files were verified. Verify the actual Store install and automatic update path after approval and publication. Keep the unpacked installation until its settings have been exported and successfully imported into the Store copy. The launch kit and submission record are in [store/LISTING.md](store/LISTING.md).

**GitHub CI passed** source checks, all 34 unit/worker tests, all 20 standard browser checks, and release packaging on Ubuntu 24.04: [validation run](https://github.com/ajakubowski/local-blocker/actions/runs/44830719112), code commit `5850101`. The runner is pinned because ubuntu-latest selected an unsupported Ubuntu 26.04 image. Linux also exposed a test synchronization race: the privacy test now waits for the visit request to be durably displayed before accelerating its deadline. That corrected check passed three repeated local runs and the full Linux run.
