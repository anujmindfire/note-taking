import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
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
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/auth/forgot-password", () => {
  it("AC-S1: registered email — 200 with correct message, OtpToken row created in DB", async () => {
    // Register a user first
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });
    const userId = regRes.body.data.userId as string;

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      message: "If that email is registered, an OTP has been sent.",
    });

    // OtpToken row must be created in the DB for this user
    const otpRow = await prisma.otpToken.findFirst({ where: { userId } });
    expect(otpRow).not.toBeNull();
    expect(otpRow?.hashedOtp).toMatch(/^\$2b\$/);
    expect(otpRow?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("AC-S2: unknown email — 200 with same message, no OtpToken created", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      message: "If that email is registered, an OTP has been sent.",
    });

    const count = await prisma.otpToken.count();
    expect(count).toBe(0);
  });

  it("AC-S3: second request for same registered email — only one OtpToken row exists (first invalidated)", async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });
    const userId = regRes.body.data.userId as string;

    // First request
    const res1 = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });
    expect(res1.status).toBe(200);

    const firstOtp = await prisma.otpToken.findFirst({ where: { userId } });

    // Second request — should delete the first OTP and create a new one
    const res2 = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });
    expect(res2.status).toBe(200);

    // Only one OTP row should exist for this user
    const count = await prisma.otpToken.count({ where: { userId } });
    expect(count).toBe(1);

    // The surviving OTP should be a different row (new id)
    const latestOtp = await prisma.otpToken.findFirst({ where: { userId } });
    expect(latestOtp?.id).not.toBe(firstOtp?.id);
  });

  it("AC-S4: missing email field — 400 VALIDATION_ERROR with fields: ['email']", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("email");
  });

  it("AC-S5: invalid email format — 400 VALIDATION_ERROR with fields: ['email']", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "notanemail" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("email");
  });

  it("AC-S2 extra: unknown email — response body indistinguishable from registered email response", async () => {
    // Register user so we can compare exact body
    await request(app)
      .post("/api/auth/register")
      .send({ email: "real@example.com", password: "Secret123" });

    const realRes = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "real@example.com" });

    const fakeRes = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "fake@example.com" });

    expect(realRes.status).toBe(fakeRes.status);
    expect(realRes.body.data.message).toBe(fakeRes.body.data.message);
  });

  it("AC-S1 extra: OtpToken expiresAt is approximately 10 minutes in the future", async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "user@example.com", password: "Secret123" });
    const userId = regRes.body.data.userId as string;

    const before = Date.now();
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });
    const after = Date.now();

    const otpRow = await prisma.otpToken.findFirst({ where: { userId } });
    const tenMinMs = 10 * 60 * 1000;

    expect(otpRow?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + tenMinMs - 1000);
    expect(otpRow?.expiresAt.getTime()).toBeLessThanOrEqual(after + tenMinMs + 1000);
  });
});
