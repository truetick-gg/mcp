#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TruetickClient } from "./client.js";
import { registerTools } from "./tools.js";

const apiKey = process.env.TRUETICK_API_KEY;
if (!apiKey) {
  console.error("TRUETICK_API_KEY is required (your ttk_… key).");
  process.exit(1);
}
const baseUrl = process.env.TRUETICK_API_URL ?? "https://api.truetick.gg";

const server = new McpServer({ name: "truetick", version: "0.1.0" });
registerTools(server, new TruetickClient(baseUrl, apiKey));
await server.connect(new StdioServerTransport());
