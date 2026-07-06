export class LettaHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `Letta API returned ${status}`)
    this.name = "LettaHttpError"
  }
}

export interface LettaHttpClientOptions {
  baseUrl: string
  apiKey: string
}

export class LettaHttpClient {
  readonly baseUrl: string
  readonly apiKey: string

  constructor(options: LettaHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.apiKey = options.apiKey
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    const response = await globalThis.fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : null,
    })

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text().catch(() => "unknown error")
      }
      throw new LettaHttpError(
        response.status,
        errorBody,
        typeof errorBody === "object" && errorBody !== null
          ? String((errorBody as Record<string, unknown>).detail ?? JSON.stringify(errorBody))
          : String(errorBody),
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body)
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body)
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>("DELETE", path)
  }
}
