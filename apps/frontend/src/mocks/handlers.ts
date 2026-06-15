import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("/api/auth/register", () => {
    return HttpResponse.json({ data: { userId: "user-1" } }, { status: 201 });
  }),

  http.post("/api/auth/login", () => {
    return HttpResponse.json(
      {
        data: {
          accessToken: "token-123",
          refreshToken: "refresh-123",
          user: {
            id: "user-1",
            email: "test@example.com",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        },
      },
      { status: 200 }
    );
  }),

  http.post("/api/auth/logout", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/auth/forgot-password", () => {
    return HttpResponse.json({ data: { message: "OTP sent" } }, { status: 200 });
  }),

  http.post("/api/auth/reset-password", () => {
    return HttpResponse.json(
      { data: { message: "Password reset" } },
      { status: 200 }
    );
  }),
];
