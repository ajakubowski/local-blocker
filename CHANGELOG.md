# Changelog

## 1.1.0 — 2026-11-20

- Add local settings export/import to move groups and schedules between installations. Imports are reviewed and respect the existing cooldown; backups exclude credentials and current visits/proposals.
- Require password authentication after the settings cooldown ends, including when an earlier authentication session is still valid.
- Add regression coverage for document-bound authentication, password throttling and changes, strict subdomains during visits, embedded frames, cancellation, expired visits after restart, privacy, and migration.
- Add an opt-in real-clock ten-minute wait and five-minute visit acceptance test.
- Prepare Chrome Web Store listing copy, privacy disclosures, reviewer instructions, correctly sized screenshots, promotional artwork, and a dedicated upload ZIP.
- Add continuous integration and public contribution instructions.

## 1.0.0 — 2026-11-20

- Initial local release: groups, weekly/overnight schedules, password-protected settings, deliberate temporary visits, optional domain permissions, and split-incognito support.
