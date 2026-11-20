# Local Blocker privacy statement

Version 1.1.0 · November 20, 2026

Local Blocker does not operate a server, require an account, include analytics, sell information, or transmit browsing information to its developer or any third party. It makes no background network requests. All scripts, styles, icons, and UI resources are bundled. Its Content Security Policy prohibits outbound connections and remote resources.

## Data stored on your device

In Chrome’s `storage.local`, Local Blocker stores:

- Your groups, domain lists, weekly schedules, and timing preferences.
- A password verifier derived with PBKDF2-HMAC-SHA-256, 600,000 iterations, a random 128-bit salt, and a 256-bit derived value. The plaintext password is never saved.
- The exact pending settings proposal and its deadline, when one exists.
- The website and timestamps for the single current visit request or active visit, when one exists.
- A short-lived transaction record used to recover interrupted configuration changes.

In Chrome’s memory-backed `storage.session`, it stores the current five-minute settings authorization and failed-password-attempt throttling. Authorization is bound to the settings document and is not restored after a browser restart or extension reload.

There is no `storage.sync`, cloud backup, browsing-history database, blocked-attempt log, or persistent visit history. Current visit state is cleared on expiry or cancellation; old pending proposals are replaced or cleared. Local settings are not encrypted and are accessible to someone who controls your Chrome profile or computer.

## Local settings backups

When you explicitly export saved settings, the extension creates a local JSON file containing your groups, domain lists, schedules, and timing preferences. Exports require unlocking settings. The file contains no password, password verifier, authorization token, active visit, or pending proposal. It is not encrypted. You choose whether and where to keep or share it; the extension does not upload it. A folder you choose may independently be synced by your computer's backup or cloud-storage software.

Importing reads the file you select, validates it, and loads its settings as an unsaved draft. Review/save and the existing password/cooldown rules still apply. The current installation's password is not replaced by an import.

## Website information processed locally

Chrome’s declarative request engine compares navigation and frame requests to your configured domains. With website access granted, the extension also examines matching open-tab URLs to replace a blocked page. URLs are processed transiently; their full paths, query strings, and fragments are not stored in extension state or copied into the blocked-page address. The blocked page uses a generated configuration ID and opens the configured domain’s homepage when you return.

Normal Chrome features, including the browser’s own history, may independently retain your navigation. This extension does not change Chrome’s privacy settings or make claims about Chrome’s own data handling.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save local settings and current control state. |
| `alarms` | Reconcile schedules and saved deadlines while the UI is closed. |
| `declarativeNetRequest` | Ask Chrome to block or redirect matching website navigation. |
| Optional HTTP/HTTPS website access | Requested only for domains you add; enables the local blocked page and replacement of matching open tabs. |

Chrome requires broad HTTP/HTTPS patterns in `optional_host_permissions` so users can add arbitrary websites later. Those patterns are eligibility to request access, not an initial grant of access to every website. The extension does not request `tabs`, `history`, `cookies`, `webRequest`, or `scripting`, and injects no content scripts.

If access is denied or revoked, basic declarative blocking continues. Existing-page handling and the custom blocked page may be unavailable until access is restored. Chrome may use a broad-sounding permission warning because it describes the API capability rather than this extension’s implementation.

## Incognito and deletion

Incognito works only if you manually enable it. The same local configuration and current visit are shared across regular and incognito windows; no incognito history is recorded. Configuration and visit mutations are managed in regular windows.

Removing the extension deletes its Chrome-managed local settings. Removing downloaded source/release files is separate. For updates, keep the installation folder and reload rather than uninstalling.

Exported backup files remain wherever you saved them until you delete them yourself.

## Developer and support

Local Blocker is maintained by Andrew Jakubowski. Questions and bug reports can be filed at https://github.com/ajakubowski/local-blocker/issues. Issues are public: do not post passwords, personal browsing URLs, or settings backups. GitHub and the Chrome Web Store operate under their own privacy policies; the extension does not transmit your configuration or browsing data to either service.
