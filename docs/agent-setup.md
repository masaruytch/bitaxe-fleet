# Connect an agent to Bitaxe Fleet

The optional adapter lets compatible MCP clients query filtered Fleet observations over **local stdio**. It is not an HTTP MCP server. Agent applications and versions differ; the recipes below follow the linked client documentation and should be verified in your own environment. They do not automatically install or configure an agent.

Fleet's adapter was connected and its five tools discovered using Hermes Agent v0.22.2 on macOS. This was a connection and discovery check, not an end-to-end model conversation. The other client recipes have not yet been tested with Fleet; their documentation and behavior may change.

## Before connecting

1. Install or update Fleet following the [README](../README.md), run `npm ci` and `npm run build` in the Fleet checkout, and start the Fleet API and collector. No separate MCP package is needed.
2. In Fleet, select the workspace, open **Settings**, enable **read-only agent access**, and save. Repeat for each workspace to share. Access is off by default.
3. Identify the absolute paths to your Node executable (Node 22.22 or newer; Node 24 recommended) and to `dist/src/agent-mcp-cli.js` in your Fleet checkout. The examples use `/absolute/path/to/node` and `/absolute/path/to/bitaxe-fleet`; replace both. On Windows use Windows paths and escape backslashes in JSON. Keep existing agent configuration entries when adding Fleet.
4. The adapter defaults to `http://127.0.0.1:3080`. This is relative to the **adapter process**, not necessarily the dashboard or client host. If needed, set `BITAXE_FLEET_API_URL` in the client configuration to a reachable HTTP(S) loopback or private IPv4 origin without a path or credentials. The adapter, its Node executable, dependencies and Fleet API must be reachable from the environment where the client launches the process. A cloud agent or container does not automatically share your computer's localhost or filesystem.

The API has no built-in login; do not expose it to the internet to make an agent connection work. If you cannot arrange a private connection, keep the integration disabled.

## Hermes Agent

Merge this entry into `~/.hermes/config.yaml`, preserving existing `mcp_servers` entries:

```yaml
mcp_servers:
  bitaxe-fleet:
    command: /absolute/path/to/node
    args:
      - /absolute/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js
    # Only needed when the API is not on the default loopback address:
    # env:
    #   BITAXE_FLEET_API_URL: "http://127.0.0.1:3080"
```

Run `hermes mcp test bitaxe-fleet` to check the server, then restart Hermes or use `/reload-mcp` in a session. Ask: “Use Bitaxe Fleet to list my workspaces and show the current fleet hashrate.” See the [Hermes MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

## OpenClaw

In versions that provide the documented MCP client, open **Settings → MCP** in the Control UI, add a server named `bitaxe-fleet`, select **Stdio**, and enter the absolute Node command and adapter path as its argument. Alternatively, on the machine where the Gateway runs:

```sh
openclaw mcp add bitaxe-fleet \
  --command /absolute/path/to/node \
  --arg /absolute/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js
openclaw mcp doctor bitaxe-fleet --probe
```

Configure `BITAXE_FLEET_API_URL` through the server's environment settings if necessary. Confirm the tools are enabled for the relevant agent and runtime, and reload or restart the owning Gateway if configuration changes do not appear. `openclaw mcp serve` exposes OpenClaw as a server; it is not the command for connecting Fleet. Older releases and other runtime modes may require a different bridge or setup. See [OpenClaw's MCP connection guide](https://github.com/openclaw/openclaw/blob/main/docs/tools/mcp.md).

## Claude Desktop and Claude Code

For Claude Desktop, merge this entry into `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bitaxe-fleet": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js"]
    }
  }
}
```

Fully quit and reopen Claude Desktop, then check the available MCP tools. This local configuration is separate from Claude's cloud-hosted custom connectors.

For Claude Code, register a local server and use `/mcp` in a session to check it:

```sh
claude mcp add bitaxe-fleet -- /absolute/path/to/node /absolute/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js
```

See the [MCP SDK's client setup guide](https://py.sdk.modelcontextprotocol.io/get-started/real-host/). Consult your client's environment-variable configuration if the Fleet API is not at the default address.

## Codex

Register the local server with the CLI, then inspect it using `codex mcp list` and use `/mcp` in a Codex session:

```sh
codex mcp add bitaxe-fleet -- /absolute/path/to/node /absolute/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js
```

For a non-default API address, configure `BITAXE_FLEET_API_URL` for the server using Codex's documented environment options. The command and checkout must be present in the environment that runs the server. See the [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Cursor and VS Code

For Cursor, merge the Claude Desktop JSON example above into `~/.cursor/mcp.json` for a personal configuration or `.cursor/mcp.json` for a project. Restart Cursor and check its MCP settings. See [Cursor MCP setup](https://prod.cursor.com/help/customization/mcp).

For VS Code, use **MCP: Open User Configuration** or a workspace `.vscode/mcp.json` and merge the following into its `servers` object:

```json
{
  "servers": {
    "bitaxe-fleet": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/bitaxe-fleet/dist/src/agent-mcp-cli.js"]
    }
  }
}
```

Start or restart the server using **MCP: List Servers**, and enable its tools for the chat. VS Code's portable Copilot format uses `mcpServers` instead; see the [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

## Verify and troubleshoot

- Check that the client lists `list_workspaces`, `list_miners`, `get_miner_status`, `get_fleet_summary`, and `get_fleet_trends`. Start a new session or reload MCP after changes.
- Ask the agent to list workspaces, then ask for the current hashrate in one of them. An empty list can mean no workspace has opted in. Enable access in Fleet and save, then try again. An empty workspace has no miner readings.
- If the server does not start, check the Node version, absolute paths, build, client logs, and the permissions and environment of the process launching it. If tools report Fleet unavailable, check that the Fleet API is running and reachable from the adapter's environment. Do not paste private logs into public issue reports.
- Anonymous workspace and miner labels can change when membership changes. Data are stored observations; stale or missing values are not zero. Retention may limit trend history, and collector health is unknown.

## Privacy and permission

Fleet filters MCP responses and asks agents to request permission before accessing miners, the Fleet API, database, or configuration directly. This is guidance, not an enforced approval prompt. The workspace switch controls the adapter only; agents with separate shell, network, or database access can bypass it. Restrict those capabilities or isolate the agent if stronger controls are required. Agent providers and logs may receive the readings and timestamps returned by the adapter. See the README's Agent integration section for an instruction you can add to the agent.
