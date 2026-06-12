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
  // Clean tables in FK order
  await prisma.refreshToken.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Helper: register a user and return their access token + userId
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

// ---------------------------------------------------------------------------
// POST /api/notes
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/notes", () => {
  it("AC-N1: valid title + content — 201 with note object", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "My Note", content: "Hello world" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      userId,
      title: "My Note",
      content: "Hello world",
      deletedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      tags: [],
    });
  });

  it("AC-N2: body omitted (no title, no content) — 201, title=Untitled, content=''", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      userId,
      title: "Untitled",
      content: "",
    });
  });

  it("AC-N3: title='' (empty string) — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("title");
  });

  it("AC-N4: missing auth — 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .post("/api/notes")
      .send({ title: "My Note", content: "Hello" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/notes", () => {
  it("AC-N5: user has active notes — 200, array of notes", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Note 1", content: "Content 1" });

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Note 2", content: "Content 2" });

    const res = await request(app)
      .get("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toHaveProperty("id");
    expect(res.body.data[0]).toHaveProperty("title");
  });

  it("AC-N6: soft-deleted note excluded from list — 200, only active notes returned", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Active Note", content: "" });

    const activeId = createRes.body.data.id as string;

    // Create a second note and soft-delete it directly via prisma
    const deletedNote = await prisma.note.create({
      data: { userId, title: "Deleted Note", content: "", deletedAt: new Date() },
    });

    const res = await request(app)
      .get("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(deletedNote.id);
  });

  it("AC-N7: cross-user isolation — only caller's notes returned", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "User A Note", content: "" });

    await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "User B Note", content: "" });

    const resA = await request(app)
      .get("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data).toHaveLength(1);
    expect(resA.body.data[0].title).toBe("User A Note");
  });

  it("AC-N8: missing auth — 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/notes");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes/:id
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/notes/:id", () => {
  it("AC-N9: note exists and is owned — 200, note object", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "My Note", content: "Content" });

    const noteId = createRes.body.data.id as string;

    const res = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: noteId,
      userId,
      title: "My Note",
      content: "Content",
    });
  });

  it("AC-N10: note not found — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N11: note owned by other user — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "User A Note", content: "" });

    const noteId = createRes.body.data.id as string;

    const res = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N12: note is soft-deleted — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const deletedNote = await prisma.note.create({
      data: { userId, title: "Deleted Note", content: "", deletedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/notes/${deletedNote.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N13: missing auth — 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/notes/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/notes/:id
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("PATCH /api/notes/:id", () => {
  it("AC-N14: update title only — 200, updated note, updatedAt advances", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Original Title", content: "Content" });

    const noteId = createRes.body.data.id as string;
    const originalUpdatedAt = createRes.body.data.updatedAt as string;

    // Small pause to ensure updatedAt advances
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Updated Title" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Updated Title");
    expect(res.body.data.content).toBe("Content");
    expect(res.body.data.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("AC-N15: update content only — 200, updated note", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "My Note", content: "Original content" });

    const noteId = createRes.body.data.id as string;

    const res = await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "Updated content" });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe("Updated content");
    expect(res.body.data.title).toBe("My Note");
  });

  it("AC-N16: note not found — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .patch("/api/notes/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "New Title" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N17: note is soft-deleted — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const deletedNote = await prisma.note.create({
      data: { userId, title: "Deleted Note", content: "", deletedAt: new Date() },
    });

    const res = await request(app)
      .patch(`/api/notes/${deletedNote.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "New Title" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N18: note owned by other user — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "User A Note", content: "" });

    const noteId = createRes.body.data.id as string;

    const res = await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Hijacked Title" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N19: title='' (empty string) — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "My Note", content: "" });

    const noteId = createRes.body.data.id as string;

    const res = await request(app)
      .patch(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("title");
  });

  it("AC-N20: missing auth — 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .patch("/api/notes/00000000-0000-0000-0000-000000000000")
      .send({ title: "New Title" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/notes/:id
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("DELETE /api/notes/:id", () => {
  it("AC-N21: active note, valid owner — 204 no body; subsequent GET returns 404", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "To Delete", content: "" });

    const noteId = createRes.body.data.id as string;

    const deleteRes = await request(app)
      .delete(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(204);
    expect(deleteRes.body).toEqual({});

    const getRes = await request(app)
      .get(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N22: note not found — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .delete("/api/notes/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N23: note owned by other user — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const createRes = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "User A Note", content: "" });

    const noteId = createRes.body.data.id as string;

    const res = await request(app)
      .delete(`/api/notes/${noteId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N24: note already soft-deleted — 404 NOTE_NOT_FOUND", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const deletedNote = await prisma.note.create({
      data: { userId, title: "Already Deleted", content: "", deletedAt: new Date() },
    });

    const res = await request(app)
      .delete(`/api/notes/${deletedNote.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-N25: missing auth — 401 UNAUTHORIZED", async () => {
    const res = await request(app).delete("/api/notes/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
