import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TruetickClient } from "./client.js";
import { registerTools } from "./tools.js";
import { VERSION } from "./version.js";

// createServer builds the MCP server with every tool registered; index.ts
// connects it to stdio. Split out so a test can connect it to a client.
export function createServer(client: TruetickClient): McpServer {
  const server = new McpServer({ name: "truetick", version: VERSION });
  registerTools(server, client);
  return server;
}
