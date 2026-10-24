# Security

Bitaxe Fleet is intended for a trusted local host or access protected by an authenticated gateway. It has no built-in authentication or user roles. Compose publishes only on loopback, and the native server binds to loopback by default.

The API can register miners, rename dashboard labels, and change the collection interval. Its request-header and origin checks help protect browser writes; they are not authentication. The collector reads device telemetry and does not expose miner configuration or restart controls.

Do not expose the API directly to the public internet. Keep SQLite and backups outside a publicly served directory. Treat fleet IPs, device metadata, pool information, and observation history as private when sharing diagnostics.

If GitHub private vulnerability reporting is enabled on the published repository, use its **Security → Report a vulnerability** flow. Otherwise, contact the repository owner privately before sharing exploit details. Do not include credentials or real fleet data in public issues. The repository owner should enable private reporting before a public release.
