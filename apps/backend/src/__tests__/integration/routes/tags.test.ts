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
// GET /api/tags
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/tags", () => {
  it("AC-T1: list tags — default sort returns tags ordered by name asc", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createTag(accessToken, "Zebra");
    await createTag(accessToken, "Apple");

    const res = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe("Apple");
    expect(res.body.data[1].name).toBe("Zebra");

    // Verify full response shape
    const tag = res.body.data[0] as Record<string, unknown>;
    expect(tag).toHaveProperty("id");
    expect(tag).toHaveProperty("userId");
    expect(tag).toHaveProperty("name");
    expect(tag).toHaveProperty("color");
    expect(tag).toHaveProperty("noteCount");
    expect(tag).toHaveProperty("createdAt");
    expect(typeof tag["noteCount"]).toBe("number");
  });

  it("AC-T2: list tags — empty list returns empty array", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("AC-T3: list tags — sort by noteCount desc returns highest count first", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tagLow = await createTag(accessToken, "LowCount");
    const tagHigh = await createTag(accessToken, "HighCount");

    // Attach a note to the "High" tag to give it noteCount=1
    const note = await createNote(accessToken, "Test Note");
    await request(app)
      .post(`/api/notes/${note.id}/tags/${tagHigh.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .get("/api/tags?sortBy=noteCount&sortDir=desc")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(tagHigh.id);
    expect(res.body.data[0].noteCount).toBe(1);
    expect(res.body.data[1].id).toBe(tagLow.id);
    expect(res.body.data[1].noteCount).toBe(0);
  });

  it("AC-T4: list tags — sort by name desc returns tags Z→A", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createTag(accessToken, "Alpha");
    await createTag(accessToken, "Zeta");

    const res = await request(app)
      .get("/api/tags?sortBy=name&sortDir=desc")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe("Zeta");
    expect(res.body.data[1].name).toBe("Alpha");
  });

  it("AC-T5: list tags — invalid sortBy → 400 VALIDATION_ERROR, fields contains sortBy", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/tags?sortBy=color")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error.fields).toContain("sortBy");
  });

  it("AC-T6: list tags — invalid sortDir → 400 VALIDATION_ERROR, fields contains sortDir", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/tags?sortDir=random")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error.fields).toContain("sortDir");
  });

  it("AC-T7: list tags — noteCount excludes soft-deleted notes", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");
    const note = await createNote(accessToken, "Active Note");

    // Attach tag to note
    await request(app)
      .post(`/api/notes/${note.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    // Verify noteCount is 1 before deletion
    const beforeRes = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(beforeRes.body.data[0].noteCount).toBe(1);

    // Soft-delete the note
    await request(app)
      .delete(`/api/notes/${note.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    // noteCount should now be 0
    const res = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].noteCount).toBe(0);
  });

  it("AC-T8: list tags — cross-user isolation returns only caller's tags", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    await createTag(tokenA, "User A Tag");
    await createTag(tokenB, "User B Tag");

    const resA = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data).toHaveLength(1);
    expect(resA.body.data[0].name).toBe("User A Tag");

    const resB = await request(app)
      .get("/api/tags")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data).toHaveLength(1);
    expect(resB.body.data[0].name).toBe("User B Tag");
  });

  it("AC-T9: list tags — missing auth → 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/tags");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tags
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/tags", () => {
  it("AC-T10: create tag — name + color → 201 with color and noteCount:0 in response", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Work", color: "#3B82F6" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      userId,
      name: "Work",
      color: "#3B82F6",
      noteCount: 0,
      createdAt: expect.any(String),
    });
  });

  it("AC-T11: create tag — name only, color null → 201, color:null, noteCount:0", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Personal" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      userId,
      name: "Personal",
      color: null,
      noteCount: 0,
    });
  });

  it("AC-T12: create tag — duplicate name (exact) → 422 TAG_NAME_TAKEN", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createTag(accessToken, "Work");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Work" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NAME_TAKEN);
  });

  it("AC-T13: create tag — duplicate name (case-insensitive) → 422 TAG_NAME_TAKEN", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createTag(accessToken, "work");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "WORK" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NAME_TAKEN);
  });

  it("AC-T14: create tag — same name, different user → 201", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    await createTag(tokenA, "work");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "work" });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("work");
  });

  it("AC-T15: create tag — invalid color format → 400 VALIDATION_ERROR, fields contains color", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Work", color: "red" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error.fields).toContain("color");
  });

  it("AC-T16: create tag — missing name → 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.error.fields).toContain("name");
  });

  it("AC-T17: create tag — empty name → 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("AC-T18: create tag — name too long (51 chars) → 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const longName = "a".repeat(51);

    const res = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: longName });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("AC-T19: create tag — missing auth → 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .post("/api/tags")
      .send({ name: "Work" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tags/:id
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("PATCH /api/tags/:id", () => {
  it("AC-T20: rename tag — update name → 200, name updated in response", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Old Name");

    const res = await request(app)
      .patch(`/api/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: tag.id,
      userId,
      name: "New Name",
    });
  });

  it("AC-T21: update tag — update color → 200, color updated", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");

    const res = await request(app)
      .patch(`/api/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ color: "#FF0000" });

    expect(res.status).toBe(200);
    expect(res.body.data.color).toBe("#FF0000");
    expect(res.body.data.name).toBe("Work");
  });

  it("AC-T22: update tag — clear color (set to null) → 200, color:null", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work", "#3B82F6");

    const res = await request(app)
      .patch(`/api/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ color: null });

    expect(res.status).toBe(200);
    expect(res.body.data.color).toBeNull();
  });

  it("AC-T23: update tag — empty body no-op → 200, tag unchanged", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work", "#3B82F6");

    const res = await request(app)
      .patch(`/api/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Work");
    expect(res.body.data.color).toBe("#3B82F6");
  });

  it("AC-T24: rename tag — duplicate name (case-insensitive) → 422 TAG_NAME_TAKEN", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createTag(accessToken, "Work");
    const ideasTag = await createTag(accessToken, "Ideas");

    const res = await request(app)
      .patch(`/api/tags/${ideasTag.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "work" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NAME_TAKEN);
  });

  it("AC-T25: rename tag — same name as self → 200 (no-op)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");

    const res = await request(app)
      .patch(`/api/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "work" });

    expect(res.status).toBe(200);
    // Name may be returned as-is or updated; no error is the key assertion
    expect(res.body.error).toBeUndefined();
  });

  it("AC-T26: update tag — not found → 404 TAG_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .patch("/api/tags/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "New Name" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T27: update tag — other user's tag → 404 TAG_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const tagA = await createTag(tokenA, "User A Tag");

    const res = await request(app)
      .patch(`/api/tags/${tagA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T28: update tag — missing auth → 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .patch("/api/tags/00000000-0000-0000-0000-000000000000")
      .send({ name: "New Name" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tags/:id
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("DELETE /api/tags/:id", () => {
  it("AC-T29: delete tag — happy path → 204, notes still exist after tag deletion", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "Work");
    const note1 = await createNote(accessToken, "Note 1");
    const note2 = await createNote(accessToken, "Note 2");

    // Attach tag to both notes
    await request(app)
      .post(`/api/notes/${note1.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    await request(app)
      .post(`/api/notes/${note2.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    // Delete the tag
    const deleteRes = await request(app)
      .delete(`/api/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(204);
    expect(deleteRes.body).toEqual({});

    // Both notes should still exist
    const note1Res = await request(app)
      .get(`/api/notes/${note1.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(note1Res.status).toBe(200);
    expect(note1Res.body.data.id).toBe(note1.id);

    const note2Res = await request(app)
      .get(`/api/notes/${note2.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(note2Res.status).toBe(200);
    expect(note2Res.body.data.id).toBe(note2.id);

    // Tag should no longer appear on notes
    expect(note1Res.body.data.tags).toEqual([]);
    expect(note2Res.body.data.tags).toEqual([]);
  });

  it("AC-T30: delete tag — not found → 404 TAG_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .delete("/api/tags/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T31: delete tag — other user's tag → 404 TAG_NOT_FOUND", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    const tagA = await createTag(tokenA, "User A Tag");

    const res = await request(app)
      .delete(`/api/tags/${tagA.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.TAG_NOT_FOUND);
  });

  it("AC-T32: delete tag — missing auth → 401 UNAUTHORIZED", async () => {
    const res = await request(app).delete("/api/tags/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});
