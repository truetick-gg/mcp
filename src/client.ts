import { VERSION } from "./version.js";

const USER_AGENT = `truetick-mcp/${VERSION}`;

export class TruetickClient {
  constructor(readonly baseUrl: string, private apiKey: string) {}

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    return res;
  }

  async get(path: string): Promise<any> {
    return (await this.req(path)).json();
  }
  async post(path: string, body?: unknown): Promise<any> {
    const res = await this.req(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
  async del(path: string): Promise<void> {
    await this.req(path, { method: "DELETE" });
  }
}

// Canonical gRPC code names (google.golang.org/grpc/codes), indexed by number;
// grpc-gateway puts the number in its error body.
const GRPC_CODE_NAMES = [
  "ok", "cancelled", "unknown", "invalid_argument", "deadline_exceeded", "not_found",
  "already_exists", "permission_denied", "resource_exhausted", "failed_precondition",
  "aborted", "out_of_range", "unimplemented", "internal", "unavailable", "data_loss",
  "unauthenticated",
];

// What the API said: grpc-gateway answers {"code": 9, "message": "...",
// "details": []}, the raw handlers {"error": "..."}. Only JSON counts — every
// route these tools call is a gateway route, so a non-JSON body came from
// something in front of the API (a proxy's HTML page), not from TrueTick.
async function readRefusal(res: Response): Promise<{ message?: string; grpcCode?: string }> {
  let body: unknown;
  try { body = JSON.parse(await res.text()); } catch { return {}; }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return {};
  const o = body as Record<string, unknown>;
  if (typeof o.code === "number" && typeof o.message === "string") {
    return { message: o.message || undefined, grpcCode: GRPC_CODE_NAMES[o.code] };
  }
  if (typeof o.error === "string") return { message: o.error || undefined };
  return {};
}

// Retry-After is either delay-seconds or an HTTP-date (RFC 9110 §10.2.3); any
// other value is left out. Date.parse alone reads "-5" and "1.5" as dates in
// 2001, which told the agent "retry after 0s". A date counts only as an
// IMF-fixdate naming a real instant: Date#toUTCString prints exactly that form
// (ECMA-262), so the value must print back unchanged. The obsolete asctime and
// RFC 850 forms count as absent (V8 reads asctime in local time).
function retryAfterSeconds(value: string | null): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  if (Number.isNaN(at) || new Date(at).toUTCString() !== v) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

// errorMessage is everything the agent learns about a refusal: the MCP SDK
// turns a tool's thrown Error into a result whose only text is error.message.
// So it leads with the server's own reason ("top up your wallet to start this
// server") and adds the HTTP status, the gRPC code and Retry-After. It used to
// be a sentence invented from the status alone, which made an honest "node at
// capacity" read "Rate limited — slow down and retry shortly." (dev-01).
async function errorMessage(res: Response): Promise<string> {
  const said = await readRefusal(res);
  const retry = retryAfterSeconds(res.headers.get("retry-after"));
  const wait = retry !== undefined ? `retry after ${retry}s` : "";
  if (said.message) {
    const context = [`HTTP ${res.status}`, said.grpcCode].filter(Boolean).join(", ");
    // The server says what is wrong with the key ("invalid or missing api
    // key"); only this process knows the key came from TRUETICK_API_KEY.
    const hint = res.status === 401 ? ` — ${KEY_HINT}` : "";
    return `${said.message} (${[context, wait].filter(Boolean).join("; ")})${hint}`;
  }
  const generic = statusMessage(res.status);
  return wait ? `${generic} (${wait})` : generic;
}

const KEY_HINT = "check your TRUETICK_API_KEY (ttk_…)";

// statusMessage is the fallback when the body carried no reason of its own.
function statusMessage(status: number): string {
  switch (status) {
    case 401: return `Invalid API key — ${KEY_HINT}.`;
    case 403: return "Your API key lacks the required scope for this operation.";
    case 404: return "Not found — wrong server id or path.";
    case 429: return "Rate limited — slow down and retry shortly.";
    default: return status >= 500 ? "TrueTick API server error — try again." : `API error (HTTP ${status}).`;
  }
}
