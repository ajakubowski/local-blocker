# Contributing

Local Blocker is a small, offline Chrome extension. Keep runtime dependencies absent, permissions narrow, and all user data on the device. Do not add analytics, network clients, remote assets, content scripts, or cloud synchronization.

Open an issue before proposing a large feature. For fixes, include the problem, intended behavior, and a regression test where appropriate. Use fictitious domains and disposable test passwords; never attach your real settings backup or browser profile to a public issue.

Run `npm ci`, `npm test`, `npm run check`, and `npm run test:browser`. See [development instructions](docs/DEVELOPMENT.md) for installing the test browser. The opt-in real-time acceptance test takes approximately 15 minutes. Packaging requires the `zip` command.

Changes that relax existing restrictions must retain the password, cooldown, and post-wait confirmation path. Imports must remain policy-only drafts. Do not export password verifiers, authentication, pending proposals, or visits.

Contributions are licensed under the project's MIT license.
