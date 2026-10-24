# Pre-publication privacy review

Reviewed on 2026-10-24 for `masaruytch/bitaxe-fleet`. The repository remains private; this review does not change its visibility.

## Results

No private-data findings were identified in the reviewed source, reachable Git history, repository metadata, or GitHub Actions logs.

- Author and committer metadata use `masaruytch` and GitHub's no-reply email. The previous real name and work email are absent from the current files and reachable history.
- A targeted local comparison found no matches for known live miner IP addresses, MAC addresses, the live LAN subnet, personal filesystem paths, or the owner's prior identity indicators. The private comparison inputs and raw scan output were kept outside the repository.
- Gitleaks 8.30.1, obtained from its official release and checked against its published SHA-256 checksum, reported zero secret findings in the Git history and GitHub Actions logs. CI now repeats the complete-history scan on subsequent changes, with findings redacted in logs.
- Tracked files contain no databases, telemetry dumps, environment credentials, private keys, archives, screenshots, or history bundles. The example environment file contains only local defaults and a generic database-path example.
- Dependency downloads use the public npm registry. GitHub metadata contains only the chosen project/account identity and project description. At review time there were no releases, pull requests, issues, or uploaded Actions artifacts containing additional content; the Actions dependency cache is configured for public npm dependencies.
- The earlier commit URLs checked were unavailable in this recreated repository. Earlier development history is held separately in an archived private backup and must remain private.

## Information intentionally retained

- The chosen public identity `masaruytch` and its GitHub no-reply email in commits.
- Public copyright and attribution information for third-party dependencies in `THIRD_PARTY_NOTICES.md`. These notices must be preserved under the dependencies' licenses.
- Synthetic IP/MAC addresses, example hostnames, localhost URLs, and deliberately rejected addresses used in tests or input examples. They do not identify the live fleet.

## Keep subsequent changes clean

Ignore rules cover local settings, dependencies, generated output, databases, telemetry directories, private keys, package-manager credentials, and backup/history bundles in both Git and Docker build contexts. These rules do not protect a file deliberately force-added to Git, and secret detection does not identify every possible form of personal data. Review later changes, screenshots, diagnostics, and commit identities before publication. Repository owner profile information and other private repositories are separate from this review.

Check the latest [automated checks](https://github.com/masaruytch/bitaxe-fleet/actions/workflows/ci.yml) and repeat the manual review if the source or history changes. Making the repository public remains a separate owner decision.
