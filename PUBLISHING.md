# Publication preparation

This standalone repository contains application source, synthetic test fixtures, and setup documentation. Local configuration and live telemetry are excluded.

## Local checks completed on 2026-10-24

- Clean `npm ci` from the lockfile using Node.js 22.23.0.
- Formatting, TypeScript checks, behavior tests, and production build pass.
- `npm audit` reports no known vulnerabilities across the installed dependency set at the time checked. This is not a guarantee against undisclosed vulnerabilities.
- Compiled API starts against an empty temporary database; Overview and Devices routes load; settings persist after restart; the compiled collector completes an empty-fleet cycle without contacting miners.
- The standalone Compose file passes configuration validation.
- Publication candidate files contain no databases, environment secrets, real fleet configuration, backups, personal installation paths, or matches for the common credential patterns checked. Dependency download URLs use the npm registry.
- Ignore rules exclude generated output, dependencies, local data, and backups; `.env.example` and the lockfile are included.
- Third-party runtime dependency inventory and available license texts are recorded in `THIRD_PARTY_NOTICES.md`. Four npm packages omit a top-level license file; their entries identify their declared licenses and upstream repositories.

- MIT license selected by the owner and added to the repository, package metadata, and container image.

## Private GitHub repository

- Uploaded to the fresh private repository [masaruytch/bitaxe-fleet](https://github.com/masaruytch/bitaxe-fleet). The local `origin` points to this repository, with `main` as the remote default branch.
- The repository starts from one clean initial commit using the `masaruytch` author identity and GitHub no-reply email. Earlier development commits are excluded.
- CI checks formatting, dependency notices, TypeScript, behavior tests, production builds, the runtime dependency audit, and Docker Compose startup on an empty fleet. Review the latest [GitHub Actions run](https://github.com/masaruytch/bitaxe-fleet/actions/workflows/ci.yml) before release.
- Native SQLite compilation tools are installed only in the Docker build stage. The local Docker engine was unavailable during preparation; hosted CI supplies container build/start verification.

## Before a public release

The [privacy review](PRIVACY_REVIEW.md) records the file, history, metadata, and build-log checks completed on 2026-10-24.

- Keep the repository private until the owner explicitly requests public visibility.
- Enable GitHub secret scanning and private vulnerability reporting where available.
- Review any later UI changes and their checks before releasing them.

## Optional local Docker check

After starting Docker, run these from the repository root. This uses a disposable container on port 3081 and does not use a live database or the normal Compose volume:

```sh
docker build -t bitaxe-fleet:check .
docker run -d --name bitaxe-fleet-check -p 127.0.0.1:3081:3080 bitaxe-fleet:check
curl --fail http://127.0.0.1:3081/readyz
curl --fail http://127.0.0.1:3081/api/fleet
docker exec bitaxe-fleet-check node dist/src/collector-cli.js --once
docker stop bitaxe-fleet-check
docker rm bitaxe-fleet-check
```

Wait for readiness before the curl checks. The test fleet should be empty with a 30-second interval. Do not register real miners in this disposable check. For normal use, follow the persistent-storage setup in the README.
