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
  // Clean tables in FK order
  await prisma.refreshToken.deleteMany();
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

async function createTag(
  token: string,
  name: string,
  color?: string
): Promise<{ id: string; name: string; color: string | null; noteCount: number; createdAt: string; userId: string }> {
  const body: { name: string; color?: string } = { name };
  if (color !== undefined) body.color = color;

  const res = await request(app)
    .post("/api/tags")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

  return res.body.data as { id: string; name: string; color: string | null; noteCount: number; createdAt: string; userId: string };
}

async function createNote(token: string, title: string): Promise<{ id: string }> {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, content: "" });

  return res.body.data as { id: string };
}

// ---------------------------------------------------------------------------
// POST /api/notes/:id/tags/:tagId — Attach tag
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/notes/:id/tags/:tagId", () => {
  it("AC-T33: attach tag — happy path → 200, tag appears in note.tags", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const note = await createNote(accessToken, "My Note");
    const tag = await createTag(accessToken, "Work", "#3B82F6");

    const res = await request(app)
      .post(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: note.id,
      userId,
      title: "My Note",
      tags: expect.arrayContaining([
        expect.objectContaining({
          id: tag.id,
          name: "Work",
          color: "#3B82F6",
          noteCount: expect.any(Number),
        }),
      ]),
    });
  });

  it("AC-T34: attach tag — idempotent → 200 on second call, no error", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const note = await createNote(accessToken, "My Note");
    const tag = await createTag(accessToken, "Work");

    // First attach
    const firstRes = await request(app)
      .post(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(firstRes.status).toBe(200);

    // Second attach — must also return 200
    const secondRes = await request(app)
      .post(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.error).toBeUndefined();

    // Tag should still appear exactly once
    const tags = secondRes.body.data.tags as Array<{ id: string }>;
    const tagCount = tags.filter((t) => t.id === tag.id).length;
    expect(tagCount).toBe(1);
  });

  it("AC-T35: attach tag — note not found → 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");

    const res = await request(app)
      .post(`/api/notes/00000000-0000-0000-0000-000000000000/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-T36: attach tag — note soft-deleted → 404 NOTE_NOT_FOUND", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");

    // Create a note directly in DB with deletedAt set
    const deletedNote = await prisma.note.create({
      data: { userId, title: "Deleted Note", content: "", deletedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/notes/${deletedNote.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-T37: attach tag — tag not found → 404 TAG_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const note = await createNote(accessToken, "My Note");

    const res = await request(app)
      .post(`/api/notes/${note.id}/tags/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T38: attach tag — both note and tag not found → 404 NOTE_NOT_FOUND (note checked first)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/notes/00000000-0000-0000-0000-000000000000/tags/00000000-0000-0000-0000-000000000001")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-T39: attach tag — other user's note → 404 NOTE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const noteA = await createNote(tokenA, "User A Note");
    const tagB = await createTag(tokenB, "User B Tag");

    const res = await request(app)
      .post(`/api/notes/${noteA.id}/tags/${tagB.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-T40: attach tag — other user's tag (own note, foreign tag) → 404 TAG_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const noteB = await createNote(tokenB, "User B Note");
    const tagA = await createTag(tokenA, "User A Tag");

    const res = await request(app)
      .post(`/api/notes/${noteB.id}/tags/${tagA.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T41: attach tag — missing auth → 401 UNAUTHORIZED", async () => {
    const res = await request(app).post(
      "/api/notes/00000000-0000-0000-0000-000000000000/tags/00000000-0000-0000-0000-000000000001"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/notes/:id/tags/:tagId — Detach tag
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("DELETE /api/notes/:id/tags/:tagId", () => {
  it("AC-T42: detach tag — happy path → 200, tag NOT in note.tags", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const note = await createNote(accessToken, "My Note");
    const tag = await createTag(accessToken, "Work");

    // Attach first
    await request(app)
      .post(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    // Now detach
    const res = await request(app)
      .delete(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: note.id,
      userId,
    });

    const tags = res.body.data.tags as Array<{ id: string }>;
    expect(tags.find((t) => t.id === tag.id)).toBeUndefined();
  });

  it("AC-T43: detach tag — idempotent → 200 when tag not attached", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const note = await createNote(accessToken, "My Note");
    const tag = await createTag(accessToken, "Work");

    // Detach without prior attach — must not error
    const res = await request(app)
      .delete(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.data.id).toBe(note.id);
  });

  it("AC-T44: detach tag — note not found → 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");

    const res = await request(app)
      .delete(`/api/notes/00000000-0000-0000-0000-000000000000/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-T45: detach tag — note soft-deleted → 404 NOTE_NOT_FOUND", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");

    // Create a note directly in DB with deletedAt set
    const deletedNote = await prisma.note.create({
      data: { userId, title: "Deleted Note", content: "", deletedAt: new Date() },
    });

    const res = await request(app)
      .delete(`/api/notes/${deletedNote.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-T46: detach tag — tag not found → 404 TAG_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const note = await createNote(accessToken, "My Note");

    const res = await request(app)
      .delete(`/api/notes/${note.id}/tags/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T47: detach tag — missing auth → 401 UNAUTHORIZED", async () => {
    const res = await request(app).delete(
      "/api/notes/00000000-0000-0000-0000-000000000000/tags/00000000-0000-0000-0000-000000000001"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});
