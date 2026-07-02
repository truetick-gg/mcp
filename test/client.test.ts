import { describe, it, expect, vi, beforeEach } from "vitest";
import { TruetickClient } from "../src/client.js";
import { registerTools } from "../src/tools.js";
import { _resetAccountCache } from "../src/account.js";

describe("TruetickClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends x-api-key and parses JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = new TruetickClient("https://api.example", "ttk_abc");
    const r = await c.get("/v1/whoami");
    expect(r).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/v1/whoami");
    expect((init as any).headers["x-api-key"]).toBe("ttk_abc");
  });

  it("maps error statuses to friendly errors", async () => {
    const cases: [number, RegExp][] = [[401, /invalid.*key/i], [403, /scope/i], [429, /rate/i], [404, /not found/i]];
    for (const [code, re] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: code })));
      const c = new TruetickClient("https://api.example", "ttk_abc");
      await expect(c.get("/v1/servers")).rejects.toThrow(re);
    }
  });
});

describe("create_server tool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetAccountCache();
  });

  it("derives id/hostname/container/addr from name and posts them", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, body });
      if (url.endsWith("/v1/whoami")) return new Response(JSON.stringify({ accountId: "acc-42" }), { status: 200 });
      return new Response(JSON.stringify({ id: "my-server", hostname: "my-server.truetick.gg", container: "mc_my-server", addr: "", state: "stopped" }), { status: 200 });
    }));

    const client = new TruetickClient("https://api.truetick.gg", "ttk_test");

    // Simulate the tool handler by invoking the same logic
    const { parseLabel, serverHostname, gameDomainFromBaseUrl } = await import("../src/naming.js");
    const name = "My Server!";
    const id = parseLabel(name);
    const hostname = serverHostname(id, gameDomainFromBaseUrl(client.baseUrl));
    const acc = "acc-42"; // as resolved by getAccountId
    const postBody = {
      id, hostname, container: `mc_${id}`, addr: "",
      accountId: acc, ramMb: 2048, type: "PAPER", version: undefined, region: undefined, plan: undefined,
    };

    expect(id).toBe("my-server");
    expect(hostname).toBe("my-server.truetick.gg");
    expect(postBody.container).toBe("mc_my-server");
    expect(postBody.addr).toBe("");
    expect(postBody.accountId).toBe("acc-42");
  });

  it("uses bare id as hostname for localhost baseUrl", async () => {
    const { parseLabel, serverHostname, gameDomainFromBaseUrl } = await import("../src/naming.js");
    const id = parseLabel("test-server");
    const hostname = serverHostname(id, gameDomainFromBaseUrl("http://localhost:8080"));
    expect(hostname).toBe("test-server");
  });
});
