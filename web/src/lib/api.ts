// Typed client for the FastAPI backend. Sends the Supabase access token as a bearer
// header; the API verifies it. Errors arrive as {"error": {code, message, request_id}}.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

type ApiOptions = { token?: string | null; method?: string; body?: unknown; signal?: AbortSignal };

export async function apiFetch<T>(path: string, { token, method = "GET", body, signal }: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network_error", `Can't reach the API at ${API_URL}. Is it running?`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? `Request failed (${res.status})`, err?.request_id);
  }
  return data as T;
}

// Response types mirror api/schemas/*.py
export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};
export type Me = { id: string; email: string | null; role: string | null; profile: Profile };
export type AIStatus = {
  provider: string;
  model: string;
  configured: boolean;
  available_providers: string[];
  timeout_seconds: number;
  max_retries: number;
};
export type ChatResponse = {
  text: string;
  provider: string;
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number | null; output_tokens: number | null; total_tokens: number | null };
  latency_ms: number;
  cost_usd: number | null;
};
export type Readiness = { status: string; checks: { database: string; config: Record<string, unknown> } };
