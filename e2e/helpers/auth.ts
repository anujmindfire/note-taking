import type { APIRequestContext } from "@playwright/test";

export const E2E_USER = {
  email: process.env["E2E_USER_EMAIL"] ?? "e2e@test.com",
  password: process.env["E2E_USER_PASSWORD"] ?? "",
};

export async function getAccessToken(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", { data: E2E_USER });
  const body = await res.json();
  return body.data.accessToken as string;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
