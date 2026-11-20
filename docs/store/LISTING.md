# Chrome Web Store listing — Local Blocker 1.1.0

Status: prepared for submission. This document does not mean the extension has passed Chrome Web Store review.

## Listing fields

- Name: **Local Blocker**
- Summary (manifest description): Make room for what matters. Private website blocking, weekly schedules, and deliberate pauses. No accounts or tracking.
- Category: Productivity (choose the closest available focus/workflow subcategory)
- Language: English
- Price: Free; no purchases or subscriptions
- Initial visibility: Unlisted, followed by Public after initial feedback
- Homepage/source: https://github.com/ajakubowski/local-blocker
- Support: https://github.com/ajakubowski/local-blocker/issues
- Privacy policy: https://github.com/ajakubowski/local-blocker/blob/main/PRIVACY.md

## Detailed description — paste into the listing

Make room for what matters. Local Blocker helps you keep distracting websites out of reach, with rules you choose and a deliberate pause before making exceptions.

Create website groups for social feeds, news, shopping, or anything else. Block them all day or during weekly schedules, including overnight hours. Rules include subdomains, and overlapping groups combine so your strongest active restriction stays in place.

NEED A SHORT VISIT?
By default, wait 10 minutes, then explicitly start a 5-minute visit to one website and its subdomains. Other websites stay blocked. Closing the popup does not reset the wait. You have five minutes to start a ready visit; otherwise it expires. Groups can also disallow temporary visits entirely.

BOUNDARIES THAT TAKE A MOMENT TO CHANGE
A password protects settings. Stronger restrictions apply immediately. Removing websites, reducing blocking hours, shortening waits, or extending visits requires your current cooldown, followed by a fresh password entry and confirmation. Nothing becomes less restrictive automatically.

PRIVATE, LOCAL, AND OPEN SOURCE
No account, analytics, ads, subscriptions, cloud sync, or developer server. Your settings and password verifier stay in your Chrome profile. Matching website URLs are processed on your device only to enforce the blocks; no browsing history or blocked-attempt log is kept. All extension code and assets are bundled locally. The MIT-licensed source is available on GitHub.

Website access is requested only for domains you add. Granting it enables the local blocked page and replacement of matching tabs that are already open. If you decline, basic network blocking remains available.

ADJUSTABLE TO YOUR DAY
Choose 5, 10, 15, 30, or 60 minute waits, or a longer custom wait. Set visit duration separately. Export and import your groups and schedules using a local settings file. Enable incognito blocking through Chrome's extension details if desired.

PLEASE KNOW
This is a self-control aid: it cannot prevent disabling or uninstalling the extension, editing local files/storage, changing the system clock, or using another browser/profile. Schedules use your computer's timezone. Browser startup, sleep, and delayed Chrome alarms can briefly delay enforcement. Settings and exported backups are not encrypted. Forgotten-password recovery requires reinstalling and losing the extension's stored settings.

## Upload assets

- Package: `dist/local-blocker-1.1.0-webstore.zip` (manifest at ZIP root; extension runtime only)
- Icon: `extension/icons/128.png`
- Screenshots: `docs/store/assets/01-groups.png`, `02-schedules.png`, `03-blocked.png` (1280 × 800)
- Small promotional tile: `docs/store/assets/promo-small.png` (440 × 280)
- Optional marquee: `docs/store/assets/promo-marquee.png` (1400 × 560)

## Launch sequence

1. Sign in to the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole) using the existing Google account. Google Play enrollment is separate. Complete Web Store enrollment and its one-time fee if prompted; enable 2-Step Verification and verify the contact email.
2. Choose the publisher display name and accurately answer any account/trader-status questions. These are account-owner choices; do not infer them from the extension's free price.
3. Upload the dedicated Web Store ZIP. Enter the fields above, [privacy disclosures](PRIVACY-FIELDS.md), and [reviewer instructions](REVIEWER-INSTRUCTIONS.md).
4. Choose Unlisted. Submit for review with automatic publishing disabled, so the approved listing can be inspected before release. Unlisted submissions still undergo review.
5. After approval, publish the unlisted listing and verify install/update behavior using its actual Store ID. Test with a few users, then switch the same listing to Public; keep its ID and existing users.
6. To move the current unpacked installation, unlock it and export saved settings. Keep the original installed until the Store version is installed, a new password is set, the backup is reviewed/saved, and website access is granted. Disable the unpacked copy once the Store copy is verified to avoid duplicate blockers. Do not expect active waits or passwords to migrate.

## Official references

Checked November 20, 2026:

- [Registration](https://developer.chrome.com/docs/webstore/register)
- [Publishing and deferred publication](https://developer.chrome.com/docs/webstore/publish)
- [Images and screenshot dimensions](https://developer.chrome.com/docs/webstore/images)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local data handling still requires disclosure](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Visibility and testing](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
