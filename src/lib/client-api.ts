export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    /* 非 JSON 响应 */
  }

  if (!res.ok || !json || json.ok !== true) {
    const err = json && json.ok === false ? json.error : undefined;
    throw new ApiClientError(
      err?.code ?? "UNKNOWN",
      err?.message ?? `请求失败（HTTP ${res.status}）`,
      res.status,
    );
  }
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
};

/** SWR 数据源：复用统一错误处理 */
export const swrFetcher = <T,>(url: string): Promise<T> => api.get<T>(url);
