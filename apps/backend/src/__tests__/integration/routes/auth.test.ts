import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma.js";
import { createApp } from "../../../app.js";
import type { Application } from "express";

// Integration tests require DATABASE_URL — skip gracefully when not configured
const hasDb = !!process.env["DATABASE_URL"];

let app: Application;

beforeAll(async () => {
  if (!hasDb) return;
  process.env["JWT_SECRET"] = "test_secret_for_tests";
  app = createApp();
  await prisma.$connect();
});

afterAll(async () => {
  if (!hasDb) return;
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (!hasDb) return;
  // Clean tables in FK order
  await prisma.refreshToken.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/auth/register", () => {
  it("AC-S1: valid registration — 201 with userId", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("userId");
    expect(typeof res.body.data.userId).toBe("string");
  });

  it("AC-S2: duplicate email exact — 422 EMAIL_TAKEN", async () => {
    await request(app).post("/api/auth/register").send({ email: "user@example.com", password: "Secret123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("AC-S3: duplicate email case-insensitive — 422 EMAIL_TAKEN", async () => {
    await request(app).post("/api/auth/register").send({ email: "user@example.com", password: "Secret123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "USER@EXAMPLE.COM", password: "Secret123" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("AC-S4: invalid email format — 400 VALIDATION_ERROR with fields", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "notanemail", password: "Secret123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("email");
  });

  it("AC-S5: password too short — 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Ab1" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("password");
  });

  it("AC-S6: password missing uppercase — 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "secret123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AC-S7: password missing lowercase — 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "SECRET123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AC-S8: password missing digit — 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "SecretAbc" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AC-S9: missing required fields — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/register").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AC-S10: password not stored plaintext — DB hash starts with $2b$", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });

    const userId = res.body.data.userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.passwordHash).toMatch(/^\$2b\$/);
    expect(user?.passwordHash).not.toBe("Secret123");
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send({ email: "user@example.com", password: "Secret123" });
  });

  it("AC-S11: valid login — 200 with accessToken, refreshToken, user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Secret123" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.user).toMatchObject({ email: "user@example.com" });
  });

  it("AC-S12: accessToken is JWT with userId, email, ~15-min expiry", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Secret123" });

    const token = res.body.data.accessToken as string;
    const decoded = jwt.decode(token) as { userId: string; email: string; exp: number; iat: number };

    expect(decoded.userId).toBeTruthy();
    expect(decoded.email).toBe("user@example.com");
    expect(decoded.exp - decoded.iat).toBe(900);
  });

  it("AC-S13: refreshToken persisted in DB with future expiresAt", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Secret123" });

    const refreshToken = res.body.data.refreshToken as string;
    const record = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

    expect(record).not.toBeNull();
    expect(record?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("AC-S14: wrong password — 401 INVALID_CREDENTIALS", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "WrongPass1" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("AC-S15: unknown email — 401 INVALID_CREDENTIALS (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "Secret123" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("AC-S16: missing password field — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "user@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/auth/logout", () => {
  let accessToken: string;
  let refreshToken: string;

  beforeEach(async () => {
    await request(app).post("/api/auth/register").send({ email: "user@example.com", password: "Secret123" });
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Secret123" });
    accessToken = loginRes.body.data.accessToken as string;
    refreshToken = loginRes.body.data.refreshToken as string;
  });

  it("AC-S17: valid logout — 204, revokedAt set in DB", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const record = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    expect(record?.revokedAt).not.toBeNull();
  });

  it("AC-S18: logout without auth header — 401 UNAUTHORIZED", async () => {
    const res = await request(app).post("/api/auth/logout").send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("AC-S19: logout with expired access token — 401 TOKEN_EXPIRED", async () => {
    // Sign a token that expired 1 second ago
    const expiredToken = jwt.sign(
      { userId: "test-id", email: "user@example.com" },
      "test_secret_for_tests",
      { expiresIn: -1 }
    );

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${expiredToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("AC-S20: idempotent logout — already revoked token returns 204", async () => {
    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(204);
  });

  it("AC-S21: idempotent logout — unknown token returns 204", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/auth/refresh", () => {
  let refreshToken: string;
  let userId: string;

  beforeEach(async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });
    userId = regRes.body.data.userId as string;

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Secret123" });
    refreshToken = loginRes.body.data.refreshToken as string;
  });

  it("AC-S22: valid refresh — 200 with new accessToken, old token revoked", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(typeof res.body.data.accessToken).toBe("string");

    const oldRecord = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    expect(oldRecord?.revokedAt).not.toBeNull();
  });

  it("AC-S23: refresh token not in DB — 401 REFRESH_INVALID", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_INVALID");
  });

  it("AC-S24: refresh token revoked — 401 REFRESH_INVALID", async () => {
    const accessToken = (
      await request(app).post("/api/auth/login").send({ email: "user@example.com", password: "Secret123" })
    ).body.data.accessToken as string;

    // Revoke via logout
    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_INVALID");
  });

  it("AC-S25: refresh token expired — 401 REFRESH_EXPIRED", async () => {
    // Insert a token row with a past expiresAt directly
    const expiredToken = "expired-token-uuid-test";
    await prisma.refreshToken.create({
      data: {
        userId,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_EXPIRED");
  });

  it("AC-S26: missing refreshToken field — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("Auth middleware (via /api/notes)", () => {
  it("AC-S27: no Authorization header — 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/notes");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("AC-S28: valid Bearer token — passes auth guard (route may 404, but not 401)", async () => {
    process.env["JWT_SECRET"] = "test_secret_for_tests";
    const token = jwt.sign({ userId: "test-id", email: "test@example.com" }, "test_secret_for_tests", {
      expiresIn: "15m",
    });

    const res = await request(app).get("/api/notes").set("Authorization", `Bearer ${token}`);

    // Notes route not yet implemented; auth guard passes → expect 404, not 401
    expect(res.status).not.toBe(401);
  });

  it("AC-S29: malformed Bearer token — 401 TOKEN_EXPIRED", async () => {
    const res = await request(app).get("/api/notes").set("Authorization", "Bearer not-a-jwt");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });
});
