import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../../lib/prisma.js";
import { createApp } from "../../../app.js";
import { ErrorCode } from "@noteapp/shared";
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
  // Clean tables in FK order — sharedLink before note before user
  await prisma.refreshToken.deleteMany();
  await prisma.sharedLink.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function registerAndLogin(
  email: string,
  password = "Password1"
): Promise<{ accessToken: string; userId: string }> {
  const regRes = await request(app)
    .post("/api/auth/register")
    .send({ email, password });

  const userId = regRes.body.data.userId as string;

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password });

  const accessToken = loginRes.body.data.accessToken as string;
  return { accessToken, userId };
}

async function createNote(
  token: string,
  title = "Test Note",
  content = "Some content"
): Promise<{ id: string }> {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, content });

  return res.body.data as { id: string };
}

async function createShareLink(
  token: string,
  noteId: string,
  body: Record<string, unknown> = {}
): Promise<{
  id: string;
  noteId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}> {
  const res = await request(app)
    .post(`/api/notes/${noteId}/shares`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

  return res.body.data as {
    id: string;
    noteId: string;
    token: string;
    expiresAt: string | null;
    revokedAt: string | null;
    viewCount: number;
    createdAt: string;
  };
}

// ---------------------------------------------------------------------------
// POST /api/notes/:id/shares — Generate share link
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/notes/:id/shares", () => {
  it("AC-S1: generate link — no expiry returns 201 with token, null expiresAt, null revokedAt, viewCount 0", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "My Note");

    const res = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      noteId: note.id,
      token: expect.any(String),
      expiresAt: null,
      revokedAt: null,
      viewCount: 0,
      createdAt: expect.any(String),
    });
    // Assert token is a 64-character hex string
    const token = res.body.data.token as string;
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    // userId is only on the note, not the link — confirm response shape has no userId leak
    expect(typeof (res.body.data as Record<string, unknown>)["userId"]).not.toBe("string");
    void userId; // referenced to keep TS happy
  });

  it("AC-S2: generate link — valid future expiresAt returns 201 with expiresAt set", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ expiresAt });

    expect(res.status).toBe(201);
    expect(res.body.data.expiresAt).not.toBeNull();
    // The stored expiresAt should be parseable and match the sent value
    const stored = new Date(res.body.data.expiresAt as string).getTime();
    const sent = new Date(expiresAt).getTime();
    expect(Math.abs(stored - sent)).toBeLessThan(1000);
  });

  it("AC-S3: generate link — multiple links on same note both created independently", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const res1 = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    const res2 = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    // Both links must have different IDs and different tokens
    expect(res1.body.data.id).not.toBe(res2.body.data.id);
    expect(res1.body.data.token).not.toBe(res2.body.data.token);
    // Both are associated with the same note
    expect(res1.body.data.noteId).toBe(note.id);
    expect(res2.body.data.noteId).toBe(note.id);
  });

  it("AC-S4: generate link — expiresAt in past returns 400 VALIDATION_ERROR with fields containing expiresAt", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ expiresAt: pastDate });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error.fields).toContain("expiresAt");
  });

  it("AC-S5: generate link — expiresAt exceeds 365-day max returns 400 VALIDATION_ERROR with fields containing expiresAt", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const beyondMax = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ expiresAt: beyondMax });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error.fields).toContain("expiresAt");
  });

  it("AC-S6: generate link — note not found returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/notes/00000000-0000-0000-0000-000000000000/shares")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S7: generate link — note belongs to other user returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const noteA = await createNote(tokenA, "User A Note");

    const res = await request(app)
      .post(`/api/notes/${noteA.id}/shares`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S8: generate link — note is soft-deleted returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    // Soft-delete the note
    await request(app)
      .delete(`/api/notes/${note.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .post(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S9: generate link — no auth returns 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .post("/api/notes/00000000-0000-0000-0000-000000000000/shares")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes/:id/shares — List share links
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/notes/:id/shares", () => {
  it("AC-S10: list links — note with 2 links returns 200 with array of 2 ISharedLinkResponse", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    await createShareLink(accessToken, note.id);
    await createShareLink(accessToken, note.id);

    const res = await request(app)
      .get(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(2);

    // Verify full response shape for first item
    const link = res.body.data[0] as Record<string, unknown>;
    expect(link).toHaveProperty("id");
    expect(link).toHaveProperty("noteId", note.id);
    expect(link).toHaveProperty("token");
    expect(link).toHaveProperty("expiresAt");
    expect(link).toHaveProperty("revokedAt");
    expect(link).toHaveProperty("viewCount");
    expect(link).toHaveProperty("createdAt");
  });

  it("AC-S11: list links — no links exist returns 200 with empty array", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const res = await request(app)
      .get(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("AC-S12: list links — includes both active and revoked links in response", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const activeLink = await createShareLink(accessToken, note.id);
    const linkToRevoke = await createShareLink(accessToken, note.id);

    // Revoke the second link
    await request(app)
      .post(`/api/shares/${linkToRevoke.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const ids = (res.body.data as Array<{ id: string }>).map((l) => l.id);
    expect(ids).toContain(activeLink.id);
    expect(ids).toContain(linkToRevoke.id);

    const revoked = (res.body.data as Array<{ id: string; revokedAt: string | null }>).find(
      (l) => l.id === linkToRevoke.id
    );
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it("AC-S13: list links — note not found returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes/00000000-0000-0000-0000-000000000000/shares")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S14: list links — note belongs to other user returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const noteA = await createNote(tokenA);

    const res = await request(app)
      .get(`/api/notes/${noteA.id}/shares`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S15: list links — no auth returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get(
      "/api/notes/00000000-0000-0000-0000-000000000000/shares"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// POST /api/shares/:shareId/revoke — Revoke share link
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/shares/:shareId/revoke", () => {
  it("AC-S16: revoke link — happy path returns 200 with revokedAt set to a non-null ISO timestamp", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    const res = await request(app)
      .post(`/api/shares/${link.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: link.id,
      noteId: note.id,
      token: link.token,
      revokedAt: expect.any(String),
      viewCount: expect.any(Number),
      createdAt: expect.any(String),
    });
    // revokedAt must be a valid ISO date string
    expect(new Date(res.body.data.revokedAt as string).getTime()).not.toBeNaN();
  });

  it("AC-S17: revoke link — already revoked returns 200 with original revokedAt unchanged (idempotent)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // First revoke
    const firstRes = await request(app)
      .post(`/api/shares/${link.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstRes.status).toBe(200);
    const firstRevokedAt = firstRes.body.data.revokedAt as string;

    // Second revoke — should be idempotent
    const secondRes = await request(app)
      .post(`/api/shares/${link.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondRes.status).toBe(200);
    // revokedAt must be identical to the first response
    expect(secondRes.body.data.revokedAt).toBe(firstRevokedAt);
  });

  it("AC-S18: revoke link — immediate effect: accessing token after revoke returns 403 SHARE_REVOKED", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // Revoke the link
    await request(app)
      .post(`/api/shares/${link.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);

    // Attempt to access via the public endpoint
    const accessRes = await request(app).get(`/api/share/${link.token}`);

    expect(accessRes.status).toBe(403);
    expect(accessRes.body.error.code).toBe(ErrorCode.SHARE_REVOKED);
  });

  it("AC-S19: revoke link — not found returns 404 SHARE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/shares/00000000-0000-0000-0000-000000000000/revoke")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_NOT_FOUND);
  });

  it("AC-S20: revoke link — belongs to other user's note returns 404 SHARE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const noteA = await createNote(tokenA);
    const linkA = await createShareLink(tokenA, noteA.id);

    const res = await request(app)
      .post(`/api/shares/${linkA.id}/revoke`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_NOT_FOUND);
  });

  it("AC-S21: revoke link — no auth returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).post(
      "/api/shares/00000000-0000-0000-0000-000000000000/revoke"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// GET /api/share/:token — Public access
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/share/:token", () => {
  it("AC-S22: public access — valid active link returns 200 with full note response including tags array", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "Shared Note", "Note content");
    const link = await createShareLink(accessToken, note.id);

    const res = await request(app).get(`/api/share/${link.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: note.id,
      title: "Shared Note",
      content: "Note content",
      deletedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      tags: expect.any(Array),
    });
    // userId is included per spec A3 (full INoteResponse)
    expect(typeof (res.body.data as Record<string, unknown>)["userId"]).toBe("string");
  });

  it("AC-S23: public access — viewCount increments by exactly 3 after 3 sequential accesses", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // Access 3 times sequentially
    await request(app).get(`/api/share/${link.token}`);
    await request(app).get(`/api/share/${link.token}`);
    await request(app).get(`/api/share/${link.token}`);

    // Fetch the links list to verify viewCount
    const listRes = await request(app)
      .get(`/api/notes/${note.id}/shares`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    const updatedLink = (
      listRes.body.data as Array<{ id: string; viewCount: number }>
    ).find((l) => l.id === link.id);
    expect(updatedLink?.viewCount).toBe(3);
  });

  it("AC-S24: public access — token not found returns 404 SHARE_NOT_FOUND", async () => {
    const res = await request(app).get("/api/share/unknowntoken00000000000000000000000000000000000000000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_NOT_FOUND);
  });

  it("AC-S25: public access — link revoked returns 403 SHARE_REVOKED", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // Revoke the link
    await request(app)
      .post(`/api/shares/${link.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app).get(`/api/share/${link.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_REVOKED);
  });

  it("AC-S26: public access — link expired returns 410 SHARE_EXPIRED", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // Directly set expiresAt to the past in the DB to simulate expiry
    await prisma.sharedLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const res = await request(app).get(`/api/share/${link.token}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_EXPIRED);
  });

  it("AC-S27: public access — note soft-deleted returns 410 SHARE_EXPIRED", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // Soft-delete the note
    await request(app)
      .delete(`/api/notes/${note.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app).get(`/api/share/${link.token}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_EXPIRED);
  });

  it("AC-S28: public access — no auth required, valid link accessible without Authorization header", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // No Authorization header — public endpoint must succeed
    const res = await request(app).get(`/api/share/${link.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(note.id);
  });

  it("AC-S29: public access — error precedence: link with both revokedAt set and past expiresAt returns 403 SHARE_REVOKED", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);
    const link = await createShareLink(accessToken, note.id);

    // Set both revokedAt and a past expiresAt directly in DB
    await prisma.sharedLink.update({
      where: { id: link.id },
      data: {
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const res = await request(app).get(`/api/share/${link.token}`);

    // Revoked check comes before expired check → SHARE_REVOKED wins
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.SHARE_REVOKED);
  });
});
