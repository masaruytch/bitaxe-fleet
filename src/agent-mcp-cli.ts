import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createAgentServer } from "./agent-mcp.js";

try {
  const server = createAgentServer(process.env.BITAXE_FLEET_API_URL);
  serveStdio(() => server);
} catch {
  // Avoid exposing addresses or configuration in agent logs.
  console.error(
    "Could not start Bitaxe Fleet MCP. Check the adapter configuration.",
  );
  process.exitCode = 1;
}
