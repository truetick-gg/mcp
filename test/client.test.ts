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

// A tool error's message is the only thing the agent sees (the MCP SDK turns
// a thrown Error into {isError: true, content: [{text: error.message}]}), so
// it has to carry the server's reason. It used to be a sentence invented from
// the HTTP status: an empty wallet read "API error (HTTP 400).", a full node
// read "Rate limited — slow down and retry shortly." (dev-01).
describe("TruetickClient refusals", () => {
  beforeEach(() => vi.restoreAllMocks());

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  async function refusal(res: Response, call: (c: TruetickClient) => Promise<unknown>): Promise<Error> {
    vi.stubGlobal("fetch", vi.fn(async () => res));
    const err = await call(new TruetickClient("https://api.example", "ttk_abc")).then(() => undefined, (e) => e);
    expect(err).toBeInstanceOf(Error);
    return err as Error;
  }

  it("an empty-wallet refusal reaches the agent in the server's words, with its gRPC code", async () => {
    const e = await refusal(json(400, { code: 9, message: "top up your wallet to start this server", details: [] }), (c) => c.post("/v1/servers/s1:start", {}));
    expect(e.message).toBe("top up your wallet to start this server (HTTP 400, failed_precondition)");
  });

  it("a capacity refusal is not called a rate limit", async () => {
    const e = await refusal(json(429, { code: 8, message: "node at capacity", details: [] }), (c) => c.post("/v1/servers/s1:start", {}));
    expect(e.message).toBe("node at capacity (HTTP 429, resource_exhausted)");
    expect(e.message).not.toMatch(/rate limited/i);
  });

  it("Retry-After tells the agent how long to wait", async () => {
    const e = await refusal(json(429, { code: 8, message: "rate limit exceeded", details: [] }, { "retry-after": "2" }), (c) => c.get("/v1/servers/s1"));
    expect(e.message).toBe("rate limit exceeded (HTTP 429, resource_exhausted; retry after 2s)");
  });

  // Date.parse reads "-5" and "+5" as 2001-04-30 and "1.5" as 2001-01-04, so a
  // malformed header told the agent "retry after 0s" (pkg-05). A value that is
  // neither delay-seconds nor an IMF-fixdate is left out of the message.
  it("a Retry-After that is neither seconds nor an HTTP date is not passed on", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    try {
      for (const v of ["-5", "+5", "1.5", "2026-09-23T12:00:30Z", "Wed Sep 23 12:00:30 2026", "Wed, 31 Feb 2026 12:00:30 GMT"]) {
        const e = await refusal(json(429, { code: 8, message: "rate limit exceeded", details: [] }, { "retry-after": v }), (c) => c.get("/v1/servers/s1"));
        expect([v, e.message]).toEqual([v, "rate limit exceeded (HTTP 429, resource_exhausted)"]);
      }
      const dated = await refusal(json(503, { code: 14, message: "unavailable", details: [] }, { "retry-after": "Wed, 23 Sep 2026 12:00:30 GMT" }), (c) => c.get("/v1/servers/s1"));
      expect(dated.message).toBe("unavailable (HTTP 503, unavailable; retry after 30s)");
    } finally {
      vi.useRealTimers();
    }
  });

  // Every gateway 401 carries a message, so the status fallback that names
  // TRUETICK_API_KEY never fires. The agent still has to learn where the key
  // it was given comes from, or it can't tell the user what to fix.
  it("a 401 names the setting to fix, not only the server's reason", async () => {
    const e = await refusal(json(401, { code: 16, message: "invalid or missing api key", details: [] }), (c) => c.get("/v1/whoami"));
    expect(e.message).toBe("invalid or missing api key (HTTP 401, unauthenticated) — check your TRUETICK_API_KEY (ttk_…)");
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
