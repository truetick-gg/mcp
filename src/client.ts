export class TruetickClient {
  constructor(readonly baseUrl: string, private apiKey: string) {}

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(errorMessage(res.status));
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

function errorMessage(status: number): string {
  switch (status) {
    case 401: return "Invalid API key — check your TRUETICK_API_KEY (ttk_…).";
    case 403: return "Your API key lacks the required scope for this operation.";
    case 404: return "Not found — wrong server id or path.";
    case 429: return "Rate limited — slow down and retry shortly.";
    default: return status >= 500 ? "TrueTick API server error — try again." : `API error (HTTP ${status}).`;
  }
}
