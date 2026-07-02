import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerTools } from "../src/tools.js";
import { _resetAccountCache } from "../src/account.js";

function fakeClient() {
  return {
    get: vi.fn(async () => ({ accountId: "acc-1", servers: [] })),
    post: vi.fn(async () => ({})),
    del: vi.fn(async () => {}),
  };
}

// minimal McpServer stand-in capturing tool registrations
// matches the real .tool(name, description, zodShape, handler) overload
function fakeServer() {
  const tools: Record<string, Function> = {};
  return {
    tool: (name: string, _description: string, _schema: unknown, handler: Function) => {
      tools[name] = handler;
    },
    tools,
  };
}

describe("tools", () => {
  beforeEach(() => {
    _resetAccountCache();
    vi.restoreAllMocks();
  });

  it("registers all expected tools", () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);

    const expected = [
      "whoami", "list_servers", "get_wallet", "create_server",
      "get_server", "get_server_metrics",
      "start_server", "stop_server", "restart_server", "delete_server",
      "run_command", "update_server_version", "set_server_properties", "set_server_motd",
      "list_files", "read_file", "write_file", "delete_file",
      "create_backup", "list_backups", "restore_backup",
      "list_mods", "add_mod", "remove_mod",
      "list_templates", "create_server_from_template",
      "get_recent_logs",
    ];
    for (const name of expected) {
      expect(Object.keys(server.tools)).toContain(name);
    }
    expect(Object.keys(server.tools).length).toBe(expected.length);
  });

  it("list_servers routes to /v1/servers?account_id=acc-1", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["list_servers"]({});
    expect(client.get).toHaveBeenCalledWith("/v1/servers?account_id=acc-1");
  });

  it("run_command routes to /v1/servers/{id}:command", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["run_command"]({ serverId: "s1", command: "say hi" });
    expect(client.post).toHaveBeenCalledWith("/v1/servers/s1:command", { command: "say hi" });
  });

  it("write_file base64-encodes content", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["write_file"]({ serverId: "s1", path: "/server.properties", content: "hello" });
    expect(client.post).toHaveBeenCalledWith(
      "/v1/servers/s1/file",
      { path: "/server.properties", content: Buffer.from("hello", "utf8").toString("base64") }
    );
  });

  it("delete_server calls del and returns {deleted:true}", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    const result = await server.tools["delete_server"]({ serverId: "s1" });
    expect(client.del).toHaveBeenCalledWith("/v1/servers/s1");
    expect(result.content[0].text).toContain("true");
  });

  it("get_wallet routes to /v1/accounts/{accountId}/wallet", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["get_wallet"]({});
    expect(client.get).toHaveBeenCalledWith("/v1/accounts/acc-1/wallet");
  });

  it("restore_backup routes to /v1/servers/{id}/backups/{bid}:restore", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["restore_backup"]({ serverId: "s1", backupId: "bk42" });
    expect(client.post).toHaveBeenCalledWith("/v1/servers/s1/backups/bk42:restore", {});
  });

  it("add_mod sends versionSpec when version is provided", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["add_mod"]({ serverId: "s1", source: "modrinth", projectId: "project-1", version: "1.2.3" });
    expect(client.post).toHaveBeenCalledWith(
      "/v1/servers/s1/mods",
      { source: "modrinth", projectId: "project-1", versionSpec: "1.2.3" }
    );
  });

  it("add_mod omits versionSpec when version is not provided", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["add_mod"]({ serverId: "s1", source: "modrinth", projectId: "project-1" });
    expect(client.post).toHaveBeenCalledWith(
      "/v1/servers/s1/mods",
      { source: "modrinth", projectId: "project-1" }
    );
  });

  it("list_templates routes to GET /v1/templates", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["list_templates"]({});
    expect(client.get).toHaveBeenCalledWith("/v1/templates");
  });

  it("create_server_from_template routes to POST /v1/templates/{id}:create with overrides", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["create_server_from_template"]({ templateId: "paper-survival", name: "My Server", ramMb: 4096 });
    expect(client.post).toHaveBeenCalledWith(
      "/v1/templates/paper-survival:create",
      { name: "My Server", overrides: { ramMb: 4096 } }
    );
  });

  it("create_server_from_template omits overrides when none provided", async () => {
    const client = fakeClient();
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["create_server_from_template"]({ templateId: "paper-survival", name: "My Server" });
    expect(client.post).toHaveBeenCalledWith(
      "/v1/templates/paper-survival:create",
      { name: "My Server" }
    );
  });

  it("get_recent_logs calls GET /v1/servers/{id}/logs?tail=N with X-Api-Key and returns joined lines", async () => {
    const client = fakeClient();
    client.get = vi.fn(async () => ({ lines: ["[INFO] Server started", "[INFO] Done (2.3s)!"], cursor: "", containerMissing: false }));
    const server = fakeServer();
    registerTools(server as any, client as any);
    const result = await server.tools["get_recent_logs"]({ server_id: "s1", tail: 50 });
    expect(client.get).toHaveBeenCalledWith("/v1/servers/s1/logs?tail=50");
    expect(result.content[0].text).toBe("[INFO] Server started\n[INFO] Done (2.3s)!");
  });

  it("get_recent_logs omits tail query param when not provided", async () => {
    const client = fakeClient();
    client.get = vi.fn(async () => ({ lines: ["[INFO] Hello"], cursor: "", containerMissing: false }));
    const server = fakeServer();
    registerTools(server as any, client as any);
    await server.tools["get_recent_logs"]({ server_id: "s1" });
    expect(client.get).toHaveBeenCalledWith("/v1/servers/s1/logs");
  });

  it("get_recent_logs returns container-missing message when containerMissing is true", async () => {
    const client = fakeClient();
    client.get = vi.fn(async () => ({ lines: [], cursor: "", containerMissing: true }));
    const server = fakeServer();
    registerTools(server as any, client as any);
    const result = await server.tools["get_recent_logs"]({ server_id: "s1", tail: 10 });
    expect(result.content[0].text).toBe("container not running / no logs");
  });
});
