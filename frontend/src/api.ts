import type { ErrorBody } from "./types";
import { mockFetch } from "./mock";
export const TOKEN_KEY = "ems.accessToken";
export const mockMode = import.meta.env.VITE_MOCK_API === "true";
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ErrorBody,
  ) {
    super(body.message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await (mockMode ? mockFetch : fetch)(
    `${import.meta.env.VITE_API_URL || "http://localhost:8080"}/api/v1${path}`,
    { ...options, headers },
  );
  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("ems:unauthorized"));
    }
    const body = await response
      .json()
      .catch(() => ({
        code: "SERVER_ERROR",
        message: "서버 요청을 처리하지 못했습니다.",
        fieldErrors: [],
      }));
    throw new ApiError(response.status, body);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const send = <T>(path: string, method: string, body?: unknown) =>
  request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
