# Contributing

To report a bug, share a miner compatibility result or suggest a feature, [choose an issue form](https://github.com/masaruytch/bitaxe-fleet/issues/new/choose). Include the application version and relevant device/firmware details. Sanitise any logs or screenshots before posting. For security vulnerabilities, follow [SECURITY.md](SECURITY.md).

Use Node.js 24 and `npm ci` from the repository root. Source lives in `src/` (API and collector), `shared/` (contracts and formatting), and `web/` (React UI). Tests live in `tests/`.

Before submitting a change, run the checks listed in the README. Add tests for meaningful behavior changes and use synthetic fixtures. Never include real miner addresses, MAC addresses, wallet credentials, telemetry dumps, screenshots containing personal data, databases, or environment files in changes or issue reports.

Keep this a fleet monitoring application: device configuration remains in AxeOS. SQLite schema changes must preserve existing data and use a versioned migration. The API and collector must remain compatible with the same database schema.

For browser development, use the Vite proxy and configure `APP_ORIGIN` as described in the README. Keep service access local when working without authentication.

Use the Git identity you intend to publish before committing. For a GitHub account with email privacy enabled, use its GitHub no-reply email address. Set identity for this checkout with `git config --local user.name YOUR_HANDLE` and `git config --local user.email YOUR_GITHUB_NOREPLY_EMAIL`; this does not change other repositories.
