import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
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
  // Clean tables in FK order — otpToken first (references user)
  await prisma.otpToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Helper: plant a known plaintext OTP directly into DB for testing
// This is needed because the real OTP is bcrypt-hashed and cannot be read back
// from the DB after calling /forgot-password.
// ---------------------------------------------------------------------------
async function plantOtp(userId: string, plainOtp: string, expiresAt: Date): Promise<void> {
  const hashedOtp = await bcrypt.hash(plainOtp, 10);
  await prisma.otpToken.deleteMany({ where: { userId } });
  await prisma.otpToken.create({ data: { userId, hashedOtp, expiresAt } });
}

// ---------------------------------------------------------------------------
// Setup helper: register a user and return their userId
// ---------------------------------------------------------------------------
async function registerUser(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/register").send({ email, password });
  return res.body.data.userId as string;
}

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/auth/reset-password", () => {
  it("AC-S6: valid email + valid OTP + valid new password — 200 with success message, user can log in with new password", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");
    await plantOtp(userId, "654321", new Date(Date.now() + 10 * 60 * 1000));

    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ message: "Password reset successfully." });

    // User should be able to log in with the new password
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "NewSecret1" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data).toHaveProperty("accessToken");

    // Old password should no longer work
    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "OldSecret1" });
    expect(oldLoginRes.status).toBe(401);
    expect(oldLoginRes.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("AC-S7: expired OTP — 410 OTP_EXPIRED", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");
    await plantOtp(userId, "654321", new Date(Date.now() - 1000)); // 1 second in the past

    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
  });

  it("AC-S8: wrong OTP (hash mismatch) — 400 OTP_INVALID", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");
    await plantOtp(userId, "654321", new Date(Date.now() + 10 * 60 * 1000));

    // Submit a different OTP
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "000000",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_INVALID");
  });

  it("AC-S9: no OTP record for user — 400 OTP_INVALID", async () => {
    // Register user but do NOT call forgot-password or plant an OTP
    await registerUser("user@example.com", "OldSecret1");

    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_INVALID");
  });

  it("AC-S10: unknown email — 400 OTP_INVALID (anti-enumeration)", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "nobody@example.com",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_INVALID");
  });

  it("AC-S11: password fails strength rules — 400 VALIDATION_ERROR with fields: ['newPassword']", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "123456",
      newPassword: "weak",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("newPassword");
  });

  it("AC-S12: missing required fields — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.error.fields)).toBe(true);
    expect(res.body.error.fields.length).toBeGreaterThan(0);
  });

  it("AC-S12 extra: missing email only — 400 VALIDATION_ERROR with fields: ['email']", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("email");
  });

  it("AC-S12 extra: missing otp only — 400 VALIDATION_ERROR with fields: ['otp']", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("otp");
  });

  it("AC-S13: OTP single-use — second reset with same OTP returns 400 OTP_INVALID", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");
    await plantOtp(userId, "654321", new Date(Date.now() + 10 * 60 * 1000));

    // First reset — succeeds
    const firstRes = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "NewSecret1",
    });
    expect(firstRes.status).toBe(200);

    // Second reset with the same OTP — OTP row has been deleted
    const secondRes = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "AnotherSecret2",
    });

    expect(secondRes.status).toBe(400);
    expect(secondRes.body.error.code).toBe("OTP_INVALID");
  });

  it("AC-S14: after reset, old refresh tokens are revoked — /api/auth/refresh returns 401 REFRESH_INVALID", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");

    // Obtain a refresh token by logging in
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "OldSecret1" });
    const oldRefreshToken = loginRes.body.data.refreshToken as string;

    // Verify the refresh token works before reset
    const preResetRefresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: oldRefreshToken });
    expect(preResetRefresh.status).toBe(200);

    // Plant an OTP and reset the password
    // After the refresh above the old token is revoked, so get a fresh one by logging in again
    const loginRes2 = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "OldSecret1" });
    const activeRefreshToken = loginRes2.body.data.refreshToken as string;

    await plantOtp(userId, "654321", new Date(Date.now() + 10 * 60 * 1000));

    const resetRes = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "NewSecret1",
    });
    expect(resetRes.status).toBe(200);

    // The previously active refresh token should now be revoked
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: activeRefreshToken });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.code).toBe("REFRESH_INVALID");
  });

  it("AC-S14 extra: multiple active sessions all revoked after reset", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");

    // Create two active sessions (two logins)
    const session1 = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "OldSecret1" });
    const refreshToken1 = session1.body.data.refreshToken as string;

    const session2 = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "OldSecret1" });
    const refreshToken2 = session2.body.data.refreshToken as string;

    // Verify both tokens are in DB and not revoked
    const record1Before = await prisma.refreshToken.findUnique({ where: { token: refreshToken1 } });
    const record2Before = await prisma.refreshToken.findUnique({ where: { token: refreshToken2 } });
    expect(record1Before?.revokedAt).toBeNull();
    expect(record2Before?.revokedAt).toBeNull();

    // Reset password
    await plantOtp(userId, "654321", new Date(Date.now() + 10 * 60 * 1000));
    const resetRes = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "NewSecret1",
    });
    expect(resetRes.status).toBe(200);

    // Both refresh tokens should now be revoked
    const record1After = await prisma.refreshToken.findUnique({ where: { token: refreshToken1 } });
    const record2After = await prisma.refreshToken.findUnique({ where: { token: refreshToken2 } });
    expect(record1After?.revokedAt).not.toBeNull();
    expect(record2After?.revokedAt).not.toBeNull();
  });

  it("AC-S6 extra: OtpToken row deleted after successful reset", async () => {
    const userId = await registerUser("user@example.com", "OldSecret1");
    await plantOtp(userId, "654321", new Date(Date.now() + 10 * 60 * 1000));

    // Confirm OTP row exists
    const before = await prisma.otpToken.count({ where: { userId } });
    expect(before).toBe(1);

    await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "654321",
      newPassword: "NewSecret1",
    });

    // OTP row must be deleted
    const after = await prisma.otpToken.count({ where: { userId } });
    expect(after).toBe(0);
  });

  it("AC-S11 extra: password missing uppercase — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "123456",
      newPassword: "secret123",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("newPassword");
  });

  it("AC-S11 extra: password missing digit — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "123456",
      newPassword: "SecretPass",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("newPassword");
  });

  it("AC-S11 extra: password too short — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "123456",
      newPassword: "Ab1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("newPassword");
  });

  it("AC-S5 extra: invalid email format in reset-password — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "notanemail",
      otp: "123456",
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("email");
  });

  it("AC-S8 extra: OTP wrong length (not 6 digits) — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      email: "user@example.com",
      otp: "12345", // only 5 digits
      newPassword: "NewSecret1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("otp");
  });
});
