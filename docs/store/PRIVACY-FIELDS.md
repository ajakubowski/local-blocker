# Privacy practices — submission worksheet

These answers describe version 1.1.0. Recheck them against the actual dashboard wording and uploaded package before submitting.

## Single purpose

Help users limit access to websites they choose, using local weekly blocking schedules, password-protected settings, and timed temporary visits.

## Permission justifications

**storage:** Store groups, domain rules, weekly schedules, a salted password verifier, and the current pending proposal or temporary-visit deadline in chrome.storage.local. Store short-lived, document-bound authorization in chrome.storage.session. No chrome.storage.sync is used.

**alarms:** Recalculate active blocking rules at schedule boundaries and visit deadlines while extension pages are closed. A periodic reconciliation alarm repairs missing alarms and handles overdue deadlines after browser restart or wake.

**declarativeNetRequest:** Install browser-enforced rules blocking main-frame and subframe HTTP(S) navigation to user-configured domains. With optional domain access, redirect top-level navigation to the bundled blocked page. A bounded temporary visit installs an allowance scoped to one configured domain and its subdomains; stricter no-visit rules still win.

**Optional host access (http://*/* and https://*/*):** Users can choose arbitrary websites, so these optional patterns permit per-domain requests at runtime. No all-sites access is requested by the UI. Only origins for user-entered domains are requested, when saving or explicitly enabling website access. Access enables declarative redirects and inspecting/replacing matching already-open tabs. Full URLs are transient, are not logged, and are never transmitted. Declining access retains basic blocking.

## Remote code

Select **No, I am not using remote code.** All runtime JavaScript, HTML, CSS, and images ship inside the extension. No network client API, remote executable code, runtime package dependency, or cloud service is used. CSP forbids remote resources and outbound connections.

## User-data disclosures

Do not describe this product as handling no data merely because it is offline. Chrome's current [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) explicitly includes local processing and storage.

- **Authentication information:** The extension accepts a settings password locally and stores only a salted PBKDF2-HMAC-SHA-256 verifier. It never receives website account credentials. A five-minute authorization token exists in session storage.
- **Web history / browsing activity:** Matching website URLs are examined transiently on device to enforce requested blocks and replace tabs. No browsing-history database or blocked-attempt log is created; no URLs are transmitted. Domain lists and the one current visit are stored locally.
- Other categories (personal identifiers/contact details, financial information, health information, personal communications, location, website content, and behavioral click/keystroke monitoring): not requested or collected by the extension. Group names and schedules are user-entered local configuration. If the dashboard adds a separate configuration/user-generated-content category, disclose those fields there as well.

For any explanation field: "All processing and storage occur locally in the user's Chrome profile. No data is transmitted to the developer or third parties. Only configuration and current control state persist; full browsing URLs and browsing history are not stored. User-initiated exports contain configuration only and are saved to a local file."

Certifications supported by the code: no sale/transfer to third parties; no use unrelated to the extension's single purpose; no use to determine creditworthiness or for lending. Review the precise current certification text before accepting it.

Privacy policy URL: https://github.com/ajakubowski/local-blocker/blob/main/PRIVACY.md

The public repository and Store listing are hosted by GitHub/Google under their own privacy policies. The extension does not contact either service to send browsing or settings data.
