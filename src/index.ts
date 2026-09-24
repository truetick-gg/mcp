#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TruetickClient } from "./client.js";
import { createServer } from "./server.js";

const apiKey = process.env.TRUETICK_API_KEY;
if (!apiKey) {
  console.error("TRUETICK_API_KEY is required (your ttk_… key).");
  process.exit(1);
}
const baseUrl = process.env.TRUETICK_API_URL ?? "https://api.truetick.gg";

const server = createServer(new TruetickClient(baseUrl, apiKey));
await server.connect(new StdioServerTransport());
