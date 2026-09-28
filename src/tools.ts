import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TruetickClient } from "./client.js";
import { getAccountId } from "./account.js";
import { parseLabel, serverHostname, gameDomainFromBaseUrl } from "./naming.js";

// File tools take a path the API resolves inside the server's folder
// (files.CleanRel: a leading "/" and any ".." are refused).
const dirPath = z.string().describe(
  "A directory relative to the server's folder: \"\" for its root, \"plugins\", \"world/region\". A leading \"/\" and any \"..\" are refused.");
const filePath = z.string().describe(
  "A file relative to the server's folder: \"server.properties\", \"logs/latest.log\". A leading \"/\" and any \"..\" are refused.");

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

  server.tool("get_server_metrics",
    "Get live TPS/MSPT/player metrics for a server. Read `tps` together with `tpsSource`: TPS_SOURCE_UNSPECIFIED means no reading exists (first poll after a start/wake, or an empty world parked by pause-when-empty) and `tps` is a zero value there, not zero performance. `tickStatus` is the core's own word about its loop.",
    { serverId: z.string() },
    async ({ serverId }) => ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/metrics`)));

  server.tool("get_server_tick_history",
    "Get one-minute buckets of a server's tick health (TPS, mean/p95 MSPT, players, lagging, and how many polls each bucket rests on). Minutes the server slept through have no row at all — a gap is a real gap, never a zero.",
    { serverId: z.string(), hours: z.number().int().optional() },
    async ({ serverId, hours }) => {
      const q = hours === undefined ? "" : `?hours=${encodeURIComponent(String(hours))}`;
      return ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/tick-history${q}`));
    });

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

  server.tool("set_server_properties",
    "Change server.properties keys and optionally the idle-sleep timeout. Only the keys you send change; keys you leave out keep their stored value. Values apply on the server's next start.",
    {
      serverId: z.string(),
      properties: z.record(z.string()).describe("server.properties keys to set, e.g. {\"max-players\": \"20\"}. A key sent as \"\" stops the platform setting it (server.properties keeps the last value written); level-name cannot be cleared."),
      idleTimeoutMinutes: z.number().int().optional().describe("Minutes with no players before the server sleeps, 0-1440; 0 = the node's default. Omit to keep the current value."),
    },
    async ({ serverId, properties, idleTimeoutMinutes }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:set-properties`, { properties, idleTimeoutMinutes })));

  server.tool("set_server_motd", "Set the server's Message of the Day (MOTD).",
    { serverId: z.string(), motd: z.string() },
    async ({ serverId, motd }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}:set-motd`, { motd })));

  // File operations
  server.tool("list_files", "List one directory of a server's files: name, isDir, size and modTime (Unix seconds) of each entry. Not recursive.",
    { serverId: z.string(), path: dirPath },
    async ({ serverId, path }) =>
      ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/files?path=${encodeURIComponent(path)}`)));

  server.tool("read_file", "Read a text file of a server as UTF-8. A file larger than the platform returns inline is not read at all: the tool then says so instead of returning content.",
    { serverId: z.string(), path: filePath },
    async ({ serverId, path }) => {
      // The API sends proto3 bytes as base64 (same decode as the panel and the SDK).
      const r = await client.get(`/v1/servers/${encodeURIComponent(serverId)}/file?path=${encodeURIComponent(path)}`) as { content?: string; truncated?: boolean };
      // Over the read cap the API returns truncated with NO content — never
      // hand that on as an empty file.
      if (r.truncated) throw new Error(`${path} is larger than the platform returns inline; nothing was read`);
      return ok({ content: Buffer.from(r.content ?? "", "base64").toString("utf8") });
    });

  server.tool("write_file", "Write text content to a file on the server (base64-encoded internally).",
    { serverId: z.string(), path: filePath, content: z.string() },
    async ({ serverId, path, content }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/file`, {
        path,
        content: Buffer.from(content, "utf8").toString("base64"),
      })));

  server.tool("delete_file", "DESTRUCTIVE: delete a file or directory on the server. A directory is deleted with everything in it; the server's root cannot be deleted.",
    { serverId: z.string(), path: z.string().describe("Relative to the server's folder, e.g. \"plugins/Old.jar\". A leading \"/\" and any \"..\" are refused.") },
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

  // Keep (R-N4 B9): one tool, the wanted state explicit — the API refuses a
  // request without it rather than unkeeping by default.
  server.tool("set_backup_kept",
    "Keep a backup (kept: true) out of rotation until it is unkept: retention and a snapshot's 72-hour expiry leave it, and it can't be deleted until unkept (deleting the server still deletes it). Up to 3 per server; kept backups count toward the server's backup space, so keeping a daily backup is refused when it would leave no room for the next safety snapshot. kept: false puts it back into rotation, where the server's next daily, manual or scheduled backup may delete it.",
    { serverId: z.string(), backupId: z.string(), kept: z.boolean() },
    async ({ serverId, backupId, kept }) =>
      ok(await client.post(`/v1/servers/${encodeURIComponent(serverId)}/backups/${encodeURIComponent(backupId)}:set-kept`, { kept })));

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

  server.tool("list_mod_versions", "List the builds of a mod or plugin that this server can pin — its loader and Minecraft version only, pre-releases included, newest first. Pass a build's id as `version` to add_mod.",
    { serverId: z.string(), source: z.string(), projectId: z.string() },
    async ({ serverId, source, projectId }) =>
      ok(await client.get(`/v1/servers/${encodeURIComponent(serverId)}/mods/versions?source=${encodeURIComponent(source)}&project_id=${encodeURIComponent(projectId)}`)));

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
