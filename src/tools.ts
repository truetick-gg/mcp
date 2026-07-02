import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TruetickClient } from "./client.js";
import { getAccountId } from "./account.js";
import { parseLabel, serverHostname, gameDomainFromBaseUrl } from "./naming.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

export function registerTools(server: McpServer, client: TruetickClient) {
  // Account-level
  server.tool("whoami", "Show the account your API key is bound to.", {}, async () =>
    ok(await client.get("/v1/whoami")));

  server.tool("list_servers", "List your Minecraft servers.", {}, async () => {
    const acc = await getAccountId(client);
    return ok(await client.get(`/v1/servers?account_id=${encodeURIComponent(acc)}`));
  });

  server.tool("get_wallet", "Show your wallet balance and recent transactions.", {}, async () => {
    const acc = await getAccountId(client);
    return ok(await client.get(`/v1/accounts/${encodeURIComponent(acc)}/wallet`));
  });

  server.tool("create_server", "Create a new Minecraft server.",
    {
      name: z.string(),
      ramMb: z.number().int().positive(),
      type: z.string().optional(),
      version: z.string().optional(),
      region: z.string().optional(),
      plan: z.string().optional(),
    },
    async ({ name, ramMb, type, version, region, plan }) => {
      const id = parseLabel(name);
      if (!id) throw new Error("name must contain letters or numbers");
      const hostname = serverHostname(id, gameDomainFromBaseUrl(client.baseUrl));
      const acc = await getAccountId(client);
      return ok(await client.post("/v1/servers", {
        id, hostname, container: `mc_${id}`, addr: "",
        accountId: acc, ramMb, type, version, region, plan,
      }));
    });

  // Server-scoped — all take serverId
  server.tool("get_server", "Get details of a specific Minecraft server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}`)));

  server.tool("get_server_metrics", "Get live TPS/MSPT/player metrics for a server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/metrics`)));

  server.tool("start_server", "Start a stopped Minecraft server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:start`, {})));

  server.tool("stop_server", "Stop a running Minecraft server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:stop`, {})));

  server.tool("restart_server", "Restart a running Minecraft server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:restart`, {})));

  server.tool("delete_server", "DESTRUCTIVE: permanently delete a server and all its data.",
    { serverId: z.string() },
    async ({ serverId }) => { await client.del(`/v1/servers/${encodeURIComponent(serverId)}`); return ok({ deleted: true }); });

  server.tool("run_command", "Run a console (RCON) command on a running server.",
    { serverId: z.string(), command: z.string() },
    async ({ serverId, command }) => ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:command`, { command })));

  server.tool("update_server_version", "Change the server type and/or version (server must be stopped).",
    { serverId: z.string(), type: z.string(), version: z.string() },
    async ({ serverId, type, version }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:set-version`, { type, version })));

  server.tool("set_server_properties", "Update server.properties keys and optional idle timeout.",
    {
      serverId: z.string(),
      properties: z.record(z.string()),
      idleTimeoutMinutes: z.number().int().optional(),
    },
    async ({ serverId, properties, idleTimeoutMinutes }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:set-properties`, { properties, idleTimeoutMinutes })));

  server.tool("set_server_motd", "Set the server's Message of the Day (MOTD).",
    { serverId: z.string(), motd: z.string() },
    async ({ serverId, motd }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:set-motd`, { motd })));

  // File operations
  server.tool("list_files", "List files in a directory on the server.",
    { serverId: z.string(), path: z.string() },
    async ({ serverId, path }) =>
      ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/files?path=${encodeURIComponent(path)}`)));

  server.tool("read_file", "Read the contents of a file on the server.",
    { serverId: z.string(), path: z.string() },
    async ({ serverId, path }) =>
      ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/file?path=${encodeURIComponent(path)}`)));

  server.tool("write_file", "Write content to a file on the server (base64-encoded internally).",
    { serverId: z.string(), path: z.string(), content: z.string() },
    async ({ serverId, path, content }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/file`, {
        path,
        content: Buffer.from(content, "utf8").toString("base64"),
      })));

  server.tool("delete_file", "DESTRUCTIVE: delete a file on the server.",
    { serverId: z.string(), path: z.string() },
    async ({ serverId, path }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/file:delete`, { path })));

  // Backups
  server.tool("create_backup", "Create an on-demand backup of the server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/backups`, {})));

  server.tool("list_backups", "List available backups for the server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/backups`)));

  server.tool("restore_backup", "DESTRUCTIVE: restore a backup (server must be stopped, overwrites current data).",
    { serverId: z.string(), backupId: z.string() },
    async ({ serverId, backupId }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/backups/${encodeURIComponent(backupId)}:restore`, {})));

  // Mods
  server.tool("list_mods", "List mods/plugins installed on the server.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/mods`)));

  server.tool("add_mod", "Add a mod or plugin from Modrinth or CurseForge.",
    { serverId: z.string(), source: z.string(), projectId: z.string(), version: z.string().optional() },
    async ({ serverId, source, projectId, version }) => {
      const body: any = { source, projectId };
      if (version) body.versionSpec = version;
      return ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/mods`, body));
    });

  server.tool("remove_mod", "Remove a mod or plugin from the server.",
    { serverId: z.string(), source: z.string(), projectId: z.string() },
    async ({ serverId, source, projectId }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/mods:remove`, { source, projectId })));

  // Templates
  server.tool("list_templates", "List server templates (presets) you can create from.", {}, async () =>
    ok(await client.get("/v1/templates")));

  server.tool("create_server_from_template", "Create a server from a template preset.",
    {
      templateId: z.string(),
      name: z.string(),
      ramMb: z.number().optional(),
      region: z.string().optional(),
      version: z.string().optional(),
      plan: z.string().optional(),
    },
    async ({ templateId, name, ramMb, region, version, plan }) => {
      const overrides: Record<string, unknown> = {};
      if (ramMb !== undefined) overrides.ramMb = ramMb;
      if (region !== undefined) overrides.region = region;
      if (version !== undefined) overrides.version = version;
      if (plan !== undefined) overrides.plan = plan;
      const body: Record<string, unknown> = { name };
      if (Object.keys(overrides).length) body.overrides = overrides;
      return ok(await client.post(`/v1/templates/${encodeURIComponent(templateId)}:create`, body));
    });

  // Logs
  server.tool("get_recent_logs", "Fetch the most recent container log lines for a server (snapshot).",
    { server_id: z.string(), tail: z.number().int().positive().optional() },
    async ({ server_id, tail }) => {
      const url = tail !== undefined
        ? `/v1/servers/${encodeURIComponent(server_id)}/logs?tail=${tail}`
        : `/v1/servers/${encodeURIComponent(server_id)}/logs`;
      const resp = await client.get(url) as { lines: string[]; cursor: string; containerMissing: boolean };
      if (resp.containerMissing) {
        return { content: [{ type: "text" as const, text: "container not running / no logs" }] };
      }
      return { content: [{ type: "text" as const, text: (resp.lines ?? []).join("\n") }] };
    });
}
