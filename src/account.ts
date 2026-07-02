import type { TruetickClient } from "./client.js";

let cached: string | undefined;

// getAccountId resolves (once) the account bound to the API key, for account-scoped routes.
export async function getAccountId(client: TruetickClient): Promise<string> {
  if (cached) return cached;
  const r = await client.get("/v1/whoami");
  cached = String(r.accountId);
  return cached;
}

export function _resetAccountCache() { cached = undefined; } // test hook
