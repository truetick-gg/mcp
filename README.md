# TrueTick MCP Server

Manage TrueTick Minecraft servers directly from an AI agent. This MCP server exposes the full TrueTick public API as tools available to Claude and other compatible AI clients.

## Installation & Setup

### 1. Get an API Key

Visit [truetick.gg/dashboard/api-keys](https://truetick.gg/dashboard/api-keys) to create an API key. Select the scopes you need (e.g., `servers:read`, `servers:write`, `billing:read`).

### 2. Configure Claude Desktop

Add the following to your Claude Desktop config file (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, or `~/.config/Claude/claude_desktop_config.json` on Linux):

```json
{
  "mcpServers": {
    "truetick": {
      "command": "npx",
      "args": ["-y", "@truetick/mcp"],
      "env": {
        "TRUETICK_API_KEY": "ttk_your_key_here"
      }
    }
  }
}
```

Replace `ttk_your_key_here` with your actual API key.

### 3. Configuration

The MCP server reads its configuration from environment variables:

- `TRUETICK_API_KEY` (required): Your TrueTick API key with appropriate scopes.
- `TRUETICK_API_URL` (optional, defaults to `https://api.truetick.gg`): The API endpoint. Override for testing against a different environment.

## Tool Catalog

### Account & Wallet

- **whoami** — Show the account your API key is bound to.
- **list_servers** — List all your Minecraft servers.
- **get_wallet** — Show your wallet balance and recent transactions.

### Server Management

- **create_server** — Create a new Minecraft server (specify name, RAM, server type, version, region, billing plan).
- **get_server** — Get details of a specific server.
- **start_server** — Start a stopped server.
- **stop_server** — Stop a running server.
- **restart_server** — Restart a running server.
- **delete_server** — Permanently delete a server and all its data.
- **update_server_version** — Change the server type and/or version (server must be stopped).
- **set_server_properties** — Update server.properties keys and optional idle timeout.
- **set_server_motd** — Set the server's Message of the Day (MOTD).

### Console & Metrics

- **run_command** — Run a console (RCON) command on a running server.
- **get_server_metrics** — Get live TPS/MSPT/player count metrics for a server.

### File Management

- **list_files** — List files in a directory on the server.
- **read_file** — Read the contents of a file on the server.
- **write_file** — Write content to a file on the server.
- **delete_file** — Delete a file on the server.

### Backups

- **create_backup** — Create an on-demand backup of the server.
- **list_backups** — List available backups for the server.
- **restore_backup** — Restore a backup (server must be stopped; overwrites current data).

### Mods & Plugins

- **list_mods** — List mods/plugins installed on the server.
- **add_mod** — Add a mod or plugin from Modrinth or CurseForge.
- **remove_mod** — Remove a mod or plugin from the server.

## Development

```bash
npm run build      # Compile TypeScript
npm test           # Run tests
npm start          # Run the MCP server (for manual testing)
```

## License

MIT — see [LICENSE](LICENSE).

## About this repository

Development of TrueTick happens in a private monorepo; this repository mirrors
released versions of `@truetick/mcp`. Issues and discussions are welcome right
here — for code contributions, please propose the change in an issue first.

Related: [TypeScript SDK & CLI](https://github.com/truetick-gg/truetick-js) ·
[developer docs](https://docs.truetick.gg) · [truetick.gg/developers](https://truetick.gg/developers)
