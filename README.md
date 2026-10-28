# Bitaxe Fleet

An independent, open-source fleet monitoring dashboard for Bitaxe miners running AxeOS. See connection health, hashrate, temperature, power, efficiency, and all-time best difficulty in one place.

Bitaxe Fleet is an independent project, not affiliated with or endorsed by the Bitaxe project. The Bitaxe name is used to identify the miners this dashboard supports.

Built with React, TypeScript, Fastify, SQLite/Drizzle, and Recharts. The collector reads telemetry independently of your browser. Pool configuration, firmware, restarts, and other miner controls stay in AxeOS.

## Dashboard preview

![Bitaxe Fleet dashboard showing fleet health, hashrate, temperature and power charts, and six miners with online, warning and offline statuses](docs/images/dashboard-demo.png)

_Demo fleet with fictional miners and simulated readings. Your dashboard starts empty until you add your own miners._

## Quick start with Docker

Requirements: Docker Engine or Docker Desktop with Compose, and network access from the Docker host to your miners.

From the repository root:

```sh
docker compose up -d --build
docker compose logs -f collector
```

Open [http://127.0.0.1:3080](http://127.0.0.1:3080). Select **Add miner**, enter a private IPv4 address, check the detected miner, and confirm. No devices or sample telemetry are preloaded.

The API and collector share the `fleet-data` named volume in the `bitaxe-fleet` Compose project. Both restart automatically unless stopped. Stop them with `docker compose stop`; start them again with `docker compose up -d`. `docker compose down` also preserves the data volume. Adding `--volumes` deletes stored devices, settings, and history.

Port 3080 is bound to loopback. This application has no login: keep access local or behind authenticated access that you manage. Publishing this source on GitHub does not host the application. GitHub Pages cannot run the API or collector.

## Run with Node.js

Use Node.js 24 (see `.nvmrc`); Node.js 22.22 or newer is also supported. Install dependencies from the committed lockfile:

```sh
npm ci
npm run build
npm start
```

In a second terminal in the same repository, start the compiled collector:

```sh
npm run start:collector
```

Open [http://127.0.0.1:3080](http://127.0.0.1:3080). The API and collector are separate processes. Both must use the same `DATABASE_PATH` if you override it. Native Node processes do not automatically start after a reboot; use Docker Compose or your own service manager for unattended collection.

For development, run these in separate terminals:

```sh
APP_ORIGIN=http://127.0.0.1:5173 npm run dev:api
npm run dev:web
```

Vite serves port 5173 and proxies `/api` to port 3080. `npm run collect` performs a single collection cycle; `npm run collector` runs the source collector through `tsx`.

## Upgrading an existing installation

Back up the SQLite database and your current installation before upgrading. Keep your environment and service configuration. Review any local changes before updating your checkout. The database location is `DATABASE_PATH` if configured, or `~/.local/share/bitaxe-fleet/dashboard.sqlite` for native Node. Use a consistent SQLite backup (or stop both API and collector before copying the database). For Compose, back up the `fleet-data` volume; do not remove it during the upgrade.

After updating the checkout, native installations should run `npm ci` and `npm run build`, then restart both the API and collector using their existing service manager or terminals. Compose installations can run `docker compose up -d --build`; avoid `docker compose down --volumes`, which deletes stored data. The v0.3.0 database migration runs automatically and retains miners, observations, and workspace settings. Agent access is initially disabled for every workspace.

## Explore a demo fleet

After `npm ci` and `npm run build`, run:

```sh
npm run demo
```

Open [http://127.0.0.1:3081](http://127.0.0.1:3081). Six fictional miners include online, hot, and offline examples, with 24 hours of simulated trends. Readings update every 30 seconds without contacting miners. Demo mode is clearly labelled and read-only. Select **Create your fleet** to begin the welcome, compatibility, and first-miner setup wizard. The demo remains available while your own fleet opens in a separate workspace.

The demo defaults to its own database at `~/.local/share/bitaxe-fleet-demo/dashboard.sqlite`. It refuses to seed a database that already contains real devices or observations. Its persistent marker also prevents the collector from polling demo devices, even if started by mistake. An existing marked demo database continues simulating on subsequent API starts.

Your created fleet defaults to port 3082 and `fleet.sqlite` beside the demo database. Its collector runs inside the same Node process, starts only after the fleet is explicitly created, and resumes on later app starts. Keep that process running for collection to continue. Reopening the wizard reuses the same fleet instead of creating duplicate workspaces. Demo readings are never copied into it.

For a custom isolated environment, set `DEMO_MODE=1`, `PORT`, `APP_ORIGIN`, and a separate `DATABASE_PATH` when starting the API. Use `FLEET_PORT` and `FLEET_DATABASE_PATH` to configure the created workspace. The fleet port must be free and reachable in your browser; a reverse proxy or container setup must also route/publish that port. No separate collector process is needed for either the demo or a fleet created through its wizard. Normal standalone installations still use the API and collector processes described above.

## Workspaces

Group miners by location, coin, or another label using the expandable **Workspaces** list in the desktop sidebar or iPhone menu. The list highlights the selected workspace. Use the settings icon beside the list heading to manage workspaces, including creating, renaming, and deleting an empty workspace. Move its miners first; the default workspace cannot be deleted. Deleting a workspace also removes its collection settings. Your current choice is remembered in this browser; separate tabs can stay on different workspaces.

Each miner belongs to one workspace. New registrations use the selected workspace. To move an existing miner, open **Inspect → Workspace**, choose its destination, and select **Move miner**. Its identity, icon preferences, and collected history stay intact. Overview totals, device lists, and all trend ranges show only the selected workspace. Charts group historical readings by each miner's current workspace membership.

Existing installations migrate all miners into **My mining fleet**, which you can rename. Workspaces and assignments are stored in SQLite. The collector continues monitoring every workspace when you switch groups or close the browser. Collection frequency can be set separately for each workspace in **Settings → Workspace settings**. Temperature units are saved per workspace. Retention remains shared across the installation; screenshot privacy remains a browser preference. Screenshot privacy also masks workspace names.

Workspaces are organizational groups within one installation, not separate user accounts. The dashboard server still needs network access to every miner, including miners at other locations. IP and MAC duplicate detection applies across all workspaces.

## Manage your fleet

- **Add miner:** enter its private IPv4 address, check the connection, optionally choose a friendly name, then confirm. Checking alone does not register it. Verification expires after two minutes. Duplicate IP and MAC addresses are detected.
- **iPhone navigation:** use the hamburger menu to open Overview, Devices, Settings, screenshot privacy, and appearance controls. Compatibility is under About Bitaxe Fleet. The GitHub repository is linked in the menu, desktop sidebar, and page footer. Open **About Bitaxe Fleet → README** to read this documentation in the dashboard.
- **Nicknames:** select the pencil beside a miner's name on Overview or Devices. Names are saved in the dashboard and chart legends; identity and history are preserved.
- **Coin and icon:** select the icon beside a device name to manually label it BTC, BCH, DGB (SHA-256d), or leave it unassigned. Choose a preset icon independently, or upload a PNG/JPEG/WebP image up to 5 MB. Uploads are center-cropped to a 128 × 128 PNG and saved in SQLite; reset restores the coin icon. These dashboard labels do not change mining configuration or detect the coin.
- **Settings:** use the top-bar dialog to rename the selected workspace, change its collection interval and temperature unit, or opt in to agent access. The initial interval is 30 seconds unless configured otherwise, with a range of 10–3,600 seconds. Existing installations retain their previous interval; new workspaces inherit that installation default until changed. The running collector applies saved changes without a restart.
- **Inspect:** view hashrate, chip temperature, and power charts over the collection interval, 1 hour, 24 hours, or 7 days, with longer windows averaging uninterrupted readings while retaining gaps; plus best difficulty since boot, uptime at the latest observation, Stratum host/port/user, and firmware. Open the miner's own AxeOS interface for controls.
  Use **Settings → Temperature** to choose °C or °F for the selected workspace. Save settings to apply the choice to readings and charts across browsers. Existing workspaces initially use °C.
- **Pool accuracy:** host, port, and worker follow AxeOS's reported primary/fallback selection. If the firmware does not report selection, configured primary details are labelled unconfirmed. Older stored readings have no port/user or confirmed selection until fresh data arrives. Pool passwords are never collected.
- **Screenshot privacy:** use the eye icon beside a sensitive value to hide/reveal it consistently across views. The top-bar Screenshot privacy toggle hides miner names, IPs, Stratum hosts/ports, worker or wallet strings, connection details, and custom images together; chart legends/tooltips use anonymous miner labels. Global mode locks individual reveal buttons until switched off and remembers your previous field choices. Preferences stay in this browser, including after reload. This masks the display for screenshots; stored data and API responses remain unchanged.
- **Status explanations:** warning, offline, stale, and awaiting-data badges include a visible reason. High temperature (70°C or higher) and zero hashrate can both be reported together.

Registration supports private IPv4 addresses. Hostnames, public/loopback/link-local addresses, custom ports, and redirects are rejected. Probes have request-duration and response-size limits. Browser writes require an application request header and an allowed origin.

## Agent integration (read-only preview)

The optional local MCP adapter lets an MCP-capable agent query a running Fleet installation. It is included in this repository, uses the existing API, and needs no separate miner registration. Agent access is off by default for every workspace, including existing workspaces. Enable **Agent access** in the selected workspace's Settings and save; repeat for each workspace you want to share. The adapter does not start automatically. After `npm ci` and `npm run build`, configure the agent to launch:

See the [agent setup guide](docs/agent-setup.md) for Hermes, OpenClaw, Claude Desktop and Claude Code, Codex, Cursor, and VS Code examples, verification, and client-specific limitations.

```sh
node /path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js
```

Replace the path with your checkout. The agent must run a supported Node.js version and have access to the Fleet API. By default the adapter connects to `http://127.0.0.1:3080`; optionally set `BITAXE_FLEET_API_URL` to an HTTP(S) origin on loopback or a private IPv4 network. Addresses with credentials, paths, and redirects are rejected. In containers, loopback refers to the container itself: configure a reachable private address instead. The existing API has no login and should not be exposed directly to the internet.

For example, a local Hermes configuration can use:

```yaml
mcp_servers:
  bitaxe-fleet:
    command: node
    args: ["/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js"]
    env:
      BITAXE_FLEET_API_URL: "http://127.0.0.1:3080"
```

Replace the checkout path and, if necessary, use the absolute path to your Node executable. Agent configuration and available MCP transports vary; the adapter uses stdio, not an HTTP MCP endpoint. No agent configuration is changed by installing Fleet.

The preview exposes `list_workspaces`, `list_miners`, `get_miner_status`, `get_fleet_summary`, and `get_fleet_trends`. If more than one workspace exists, choose its anonymous label from `list_workspaces`. Call `list_miners` before asking about a particular anonymous miner. Labels such as `Workspace 1` and `Miner 1` are assigned from the current inventory; they can change when workspaces or miner membership change and should not be treated as permanent identifiers.

Miner results include the device-reported all-time best share difficulty and best share difficulty for the current device session. These are separate values, and the session value can reset when the miner restarts. Unavailable, offline, and stale readings are null; a reported zero remains zero. These values come from the latest stored observation and do not imply a block was found.

Responses are built from an allowlist: operational measurements, status, coverage, and timestamps. They do not include workspace or miner names, IP or MAC addresses, pool and worker identities, raw errors, or custom images. Fleet summaries report partial coverage rather than substituting zero for unavailable readings. Data are stored observations, not new polls; collector health is reported as unknown, and history can be shorter than the requested range. Demo results are marked as simulated.

Disabling agent access stops subsequent adapter requests from selecting that workspace, though a request already in progress may finish. The adapter reads the existing Fleet API, which may contain private fields. This setting does not restrict that API, remove stored data, or prevent an agent with separate shell, network, database, or API access from bypassing the adapter. Screenshot privacy controls the dashboard display, not the API. An agent may send returned measurements and timestamps to its model provider or retain them in conversations; review your agent's configuration and permissions. Treat the stdio MCP server as a local user process, not an authenticated remote service.

The MCP server asks agents to use its tools for Fleet questions and to request explicit permission before accessing miners, the Fleet API, database, or configuration directly. You can reinforce this in Hermes or another agent's own instructions:

> For Bitaxe Fleet questions, use only the Bitaxe Fleet MCP tools. Do not access miners, the Fleet API, the Fleet database, or configuration files directly without my explicit permission. If the tools cannot provide a requested value, explain what is missing and ask before direct access. Describe what you intend to access and what additional private information may be exposed. Permission applies only to that specific request. If permission is declined or not given, do not access it.

These instructions are advisory: a client may ignore them or use other tools before receiving them. They do not create an enforced approval prompt or access boundary. For stronger protection, restrict the agent's terminal, file, network, and other tools or isolate it from the raw API, database, and miners while allowing the trusted adapter access.

## Miner compatibility

**Bitaxe Gamma 601 is the only maintainer-tested board so far.** Other Gamma revisions, Max, Ultra, Supra, Gamma Turbo, and other AxeOS-based miners are unverified. A compatible connection check is required before adding any miner; it does not certify every firmware or hardware combination.

| Miner                                                                  | Status            | Notes                                                                                                         |
| ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Bitaxe Gamma 601                                                       | Maintainer-tested | The tested board. Exact firmware-version coverage has not been catalogued; available readings may vary.       |
| Other Gamma revisions                                                  | Unverified        | Other 600-series revisions have not been tested with this dashboard.                                          |
| Bitaxe Max, Ultra, Supra, Gamma Turbo                                  | Unverified        | These AxeOS model families have not been tested with this dashboard.                                          |
| Other AxeOS-based miners                                               | Unverified        | A successful connection check validates required telemetry fields, not complete model/firmware compatibility. |
| Devices without compatible AxeOS telemetry, including USB-only devices | Not supported     | A reachable AxeOS monitoring API on a private IPv4 address is required.                                       |

See the in-app **Compatibility** page or [COMPATIBILITY.md](COMPATIBILITY.md) for the current list and requirements. The connection review identifies board revision 601 with a BM1370 ASIC as a match for the tested model. Missing or different board metadata stays unverified.

Use the sun/moon toggle in the top navigation bar to switch between dark and light themes. Your choice is saved in this browser; dark is the default.

## Collection and history

Fleet trends include a live view labelled with the collection interval in Settings (30 sec by default), alongside 1 hour, 24 hours, and 7 days. The live view covers 25 collection intervals (12½ minutes at 30 seconds), with the newest interval at the right edge and older data moving left. It refreshes stored chart data every 5 seconds and uses second-level time labels and visible point markers. Unavailable history stays empty instead of being filled with invented readings. Changing the collection interval updates the label and window automatically; selecting it does not trigger extra miner polls.

The collector reads each miner's `/api/system/info`, with at most four concurrent requests and a five-second default timeout. It schedules each workspace independently, waits its configured interval after a completed cycle, checks changes every second, and reloads the device inventory on each cycle. A database lease prevents overlapping collection runs. A busy collector can delay a due workspace until the current cycle completes.

The browser reads stored fleet data every 15 seconds and historical chart data every 60 seconds. The collection-interval chart range refreshes every 5 seconds. Refreshing the page does not poll the miners. Collection continues with the browser closed while the collector process is running.

Failed polls are stored separately from successful readings. Data becomes stale after three collection intervals, with a minimum of 180 seconds. Missing measurements stay null, with gaps in charts rather than fabricated zeroes. Temperatures of 70°C or higher and zero hashrate produce warnings.

History retention defaults to **24 hours**. The 7-day chart window can be used if you explicitly increase `RETENTION_DAYS` before collecting that history; increasing retention cannot recover deleted samples. The UI displays SHA-256 hashrate in TH/s and AxeOS all-time best difficulty using K/M/G/T/P/E suffixes. Each miner is averaged before fleet totals are calculated.

## Configuration

`.env.example` documents available variables. For native Node, set these as process environment variables; the application does not automatically load `.env` files. Compose reads its own `.env` for variable substitution, and only passes variables explicitly listed in `compose.yaml`.

| Variable                | Default                                        | Purpose                                                                                 |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `HOST`                  | `127.0.0.1`                                    | Native API bind address; container uses `0.0.0.0`.                                      |
| `PORT`                  | `3080`                                         | Native API port; Compose publishes port 3080 on loopback.                               |
| `DATABASE_PATH`         | `~/.local/share/bitaxe-fleet/dashboard.sqlite` | Native SQLite file; containers use `/data/dashboard.sqlite`.                            |
| `POLL_INTERVAL_SECONDS` | `30`                                           | Initial collection interval until one has been saved in Settings. Use 10–3,600 seconds. |
| `MINER_TIMEOUT_MS`      | `5000`                                         | Per-miner request timeout.                                                              |
| `RETENTION_DAYS`        | `1`                                            | History retention, applied by the collector.                                            |
| `APP_ORIGIN`            | `http://127.0.0.1:3080`                        | Browser origin allowed to update dashboard inventory and settings.                      |

Workspace collection settings override the saved installation default, which in turn overrides the environment default. The collector needs LAN access to miner addresses; a cloud server generally cannot reach miners on a home network without additional networking.

## Storage, backup, and upgrade

SQLite stores workspaces, device assignments, registered devices, nicknames, coin labels, custom icons, settings, and observations. Keep it on local storage; WAL mode requires local filesystem semantics. Never commit databases, WAL/SHM files, backups, `.env`, or real fleet configuration. Ignore rules cover these files.

Use SQLite's online backup API for a running installation. For an offline file copy, stop both API and collector first and preserve any WAL/SHM files alongside the database. Store backups outside the repository and test restoration before depending on them.

For an upgrade, back up first, update the source, rebuild, and restart both processes. With Compose, run `docker compose up -d --build` using the same project name and data volume. Schema upgrades run transactionally without replacing existing device data.

## Development checks

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

CI runs formatting, type checks, tests, and builds on Node.js 22 and 24, plus a fresh Docker Compose smoke test. Test fixtures use synthetic telemetry and private example addresses; they do not contact real miners. See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [publication checklist](PUBLISHING.md).

## HTTP API

| Method | Path                               | Purpose                                                                                        |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/healthz`                         | Process liveness.                                                                              |
| GET    | `/readyz`                          | Database availability.                                                                         |
| GET    | `/api/fleet`                       | Devices, latest readings, health, and collection interval.                                     |
| GET    | `/api/miners/:id/history?hours=24` | Device history, capped at 10,000 observations and 168 requested hours.                         |
| GET    | `/api/miners/:id/trends?hours=24`  | Device charts with gaps preserved; use `range=collection` for the live window.                 |
| GET    | `/api/fleet/trends?hours=24`       | Chart data for 1, 24, or 168 hours; use `?range=collection` for the saved collection interval. |
| POST   | `/api/fleet/create`                | Create or reopen a separate real fleet from the demo wizard.                                   |
| POST   | `/api/miners/probe`                | Verify an address and obtain a short-lived registration token.                                 |
| POST   | `/api/miners`                      | Register a verified miner with an optional friendly name.                                      |
| PATCH  | `/api/miners/:id`                  | Update a dashboard nickname.                                                                   |
| PATCH  | `/api/miners/:id/appearance`       | Save manual coin and preset/custom icon preferences.                                           |
| GET    | `/api/workspaces`                  | List workspaces and miner counts.                                                              |
| POST   | `/api/workspaces`                  | Create a named workspace.                                                                      |
| PATCH  | `/api/workspaces/:id`              | Rename a workspace.                                                                            |
| DELETE | `/api/workspaces/:id`              | Delete an empty, non-default workspace.                                                        |
| PATCH  | `/api/miners/:id/workspace`        | Move a miner without replacing identity or history.                                            |
| GET    | `/api/settings?workspaceId=…`      | Read the selected workspace collection interval (default workspace when omitted).              |
| PATCH  | `/api/settings?workspaceId=…`      | Save the workspace collection interval and optionally rename it atomically.                    |

Fleet, trend, and miner-history reads accept `workspaceId`; omitting it selects the default workspace. Miner registration accepts `workspaceId` in its confirmation body. Workspace management uses the same origin/request-header protection as other dashboard writes and is disabled in demo mode.

There are no endpoints for changing miner hardware settings.

## License

Licensed under the [MIT License](LICENSE). Copyright (c) 2026 masaruytch. Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
