# Reviewer test instructions

No account, subscription, remote service, or developer-supplied credential is required. Use a disposable Chrome profile and any password of at least eight characters. Do not use your normal account password.

1. Open Local Blocker from the toolbar and choose Settings. Create a settings password. Add an Always blocked group containing `example.com`; leave temporary visits enabled. Review the exact domains and save. Accept the optional domain permission prompt.
2. Navigate to `https://example.com`. It should redirect to the local blocked page. A matching already-open tab is also replaced when the group is saved. The blocked-page address contains a generated configuration ID, not the original URL.
3. Request a temporary visit. The default wait is ten minutes; attempting to start sooner is rejected. Close/reopen the page to see the persistent countdown. Once ready, explicitly start the five-minute visit. The website becomes accessible, then an open matching tab is blocked again on expiry. No password is needed for this visit. Only one visit/request is allowed at a time.
4. For a shorter subsequent check, unlock settings and propose a five-minute cooldown and one-minute visit. Shortening the cooldown waits through the existing ten minutes. After that, enter the password in the pending-change panel and confirm. This protection is intentional; no reviewer bypass is shipped.
5. Removing the group or reducing its coverage also creates a pending proposal. Current restrictions remain until the old cooldown completes and a password is entered again to confirm. Stronger restrictions (adding a site, longer wait, shorter visit, or disabling visits) apply immediately after authenticated review/save.
6. For a schedule test, use a fresh disposable profile, choose Weekly schedule, and set a window starting a minute or two from now. Keep `example.com` open. Its tab should be replaced at the boundary (allow for Chrome alarm scheduling). End times are exclusive and overnight windows use the selected start day.
7. Decline or revoke site access to verify Chrome's basic blocked-request page is still shown for new matching navigation. The settings page explains that custom redirects and existing-tab handling need the optional permission.
8. In Chrome extension details, optionally enable Allow in Incognito. Blocks apply there too; settings and temporary-visit controls direct you to a regular window.
9. Unlock settings, export saved settings, and inspect the local JSON file. It contains groups/schedules/timing only. Import the file into a fresh installation after setting its password. Imports are unsaved drafts until review/save; importing weaker rules into an existing installation still requires the old cooldown.

The source contains automated policy/worker/browser tests and an opt-in 15-minute real-time acceptance test. Tests use separate browser profiles; state acceleration appears only in test files, never in the upload ZIP.

Known limits are intentional and disclosed: this is a self-control tool, not managed-browser enforcement. Chrome extension removal/disable controls, system clock changes, other profiles/browsers, and direct local-file/storage edits remain outside its protection. Chrome may delay alarms after restart or sleep.
