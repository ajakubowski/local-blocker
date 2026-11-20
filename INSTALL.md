# Install and maintain Local Blocker

## First installation

1. Extract `local-blocker-1.1.0.zip` into a permanent folder such as `Documents/Local Blocker`. Do not load it from inside a ZIP, a temporary directory, or a folder you plan to delete.
2. Visit `chrome://extensions` in Chrome.
3. Enable **Developer mode**, click **Load unpacked**, and select the extracted folder. Its top level contains `manifest.json`.
4. Pin Local Blocker using the puzzle-piece menu. Click its icon, then **Open settings**.
5. Create a password of at least eight characters. There is no email recovery.
6. Add a group, enter websites, choose **Always blocked** or **Weekly schedule**, and choose whether temporary visits are allowed.
7. Click **Review changes**. Check the normalized domains and schedule, then save.
8. Accept Chrome’s website-access prompt for your chosen domains to enable the blocked page and already-open-tab replacement. This access is processed locally; it does not send browsing information anywhere.

If you are working from the source project instead of the release ZIP, choose its `extension` folder in step 3.

## Incognito

Open Local Blocker’s **Details** at `chrome://extensions` and enable **Allow in Incognito**. The extension cannot enable this itself. Incognito uses the same restrictions and active visit; buttons open regular-window controls when a mutation is needed.

## Update without losing settings

1. Download a new release from a source you trust and extract it separately.
2. Replace the extension files in the **same permanent folder** used for installation.
3. At `chrome://extensions`, click Local Blocker’s **Reload** button.
4. Reopen settings and confirm the groups are still present.

Do not remove/reinstall the extension to update it. Keep the folder path unchanged because an unpacked extension’s identity can depend on its path. Settings live in Chrome’s profile, separately from the extension files. Authentication expires on reload; pending deadlines remain saved. A store installation later would be a different extension identity and would not automatically inherit local settings.

## Move to another installation or the Chrome Web Store version

1. Unlock the existing installation and choose **Export saved settings** near the bottom of Settings.
2. Keep that file private: it contains your domains and schedules in plain text.
3. Install the new copy and create its settings password.
4. Unlock it, choose **Import settings backup**, review the draft, and save. Grant access to the imported domains. Imports into an already-configured copy still follow its existing cooldown rules.
5. Confirm blocking works in the new copy, then disable the old copy to avoid two blockers running at once.

Passwords, pending changes, and visits do not migrate. Keep your old installation until you have verified the new one. A backup can restore configuration after a reinstall, but it cannot unlock the old password-protected installation.

## Troubleshooting

**Chrome shows its own blocked page:** Network blocking is working, but website access may be missing. In Local Blocker settings choose **Enable website access**. Chrome’s own site-access controls can also restrict the extension.

**An already-open page still works:** Check website access first. Verify the group’s days, local timezone, and hours. During browser wake/startup, allow Chrome time to run its background tasks. A reload or tab activation also triggers reconciliation.

**The website uses several domains:** Add each domain you want to block, such as both `x.com` and `twitter.com`. A block does not automatically discover a service’s aliases.

**Changes have not taken effect:** Weaker settings remain pending until their cooldown ends and you enter your password again to confirm the exact proposal. The passage of time alone does not apply them.

**A temporary visit is no longer ready:** The ready window lasts five minutes. Start a new wait. Closing Chrome does not pause the wait, claim window, or active visit.

**A warning badge (`!`) appears:** Open settings for the error. The extension retains its last working rules if Chrome rejects an update. Reload the extension to retry startup reconciliation. Do not assume the proposed schedule is active until the error clears and the save succeeds.

**Password forgotten:** Remove Local Blocker at `chrome://extensions`, load it again, and configure a new password and groups. This erases previous settings. There is intentionally no in-app password bypass.

**Managed computer:** Your organization may disable Developer mode or unpacked extensions. Ask the administrator about permitted installation methods; this extension does not work around organization policies.
