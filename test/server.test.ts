import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { TruetickClient } from "../src/client.js";
import { _resetAccountCache } from "../src/account.js";

// Read independently of src/: the server must report what is being published.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

async function connectedClient(): Promise<Client> {
  const server = createServer(new TruetickClient("https://api.example", "ttk_abc"));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

describe("MCP server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetAccountCache();
  });

  // index.ts hardcoded version "0.1.0" while package.json said 0.1.1 (dev-02).
  it("reports the version in package.json", async () => {
    const client = await connectedClient();
    expect(client.getServerVersion()?.version).toBe(pkg.version);
    await client.close();
  });

  it("identifies itself to the API as truetick-mcp/<version>", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new TruetickClient("https://api.example", "ttk_abc").get("/v1/whoami");
    expect((fetchMock.mock.calls[0][1] as any).headers["user-agent"]).toBe(`truetick-mcp/${pkg.version}`);
  });

  it("a refused tool call hands the agent the server's reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ code: 9, message: "top up your wallet to start this server", details: [] }),
      { status: 400, headers: { "content-type": "application/json" } },
    )));
    const client = await connectedClient();
    const res = await client.callTool({ name: "start_server", arguments: { serverId: "s1" } });
    expect(res.isError).toBe(true);
    expect((res.content as Array<{ type: string; text: string }>)[0].text).toContain("top up your wallet to start this server");
    await client.close();
  });
});
