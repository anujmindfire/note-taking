import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../../lib/prisma.js";
import { createApp } from "../../../app.js";
import { ErrorCode } from "@noteapp/shared";
import type { INoteVersion } from "@noteapp/shared";
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
  // Clean tables in FK order — noteVersion before note before user
  await prisma.noteVersion.deleteMany();
  await prisma.sharedLink.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.refreshToken.deleteMany();
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
): Promise<{ id: string; title: string; content: string }> {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, content });

  return res.body.data as { id: string; title: string; content: string };
}

async function updateNote(
  token: string,
  noteId: string,
  title?: string,
  content?: string
): Promise<{ id: string; title: string; content: string }> {
  const body: Record<string, string> = {};
  if (title !== undefined) body["title"] = title;
  if (content !== undefined) body["content"] = content;

  const res = await request(app)
    .patch(`/api/notes/${noteId}`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

  return res.body.data as { id: string; title: string; content: string };
}

// ---------------------------------------------------------------------------
// GET /api/notes/:id/versions — List versions
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/notes/:id/versions", () => {
  it("AC-S1: Snapshot on note creation — GET versions after POST returns array with 1 entry at version=1", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "First Note", "Initial content");

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(1);
    const v = res.body.data[0] as INoteVersion;
    expect(v.version).toBe(1);
    expect(v.title).toBe("First Note");
    expect(v.content).toBe("Initial content");
    expect(v.noteId).toBe(note.id);
    expect(typeof v.id).toBe("string");
    expect(typeof v.createdAt).toBe("string");
  });

  it("AC-S2: Snapshot on note update — PATCH note then GET versions returns 2 entries, latest is version=2", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "Original Title", "Original content");

    await updateNote(accessToken, note.id, "Updated Title", "Updated content");

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const versions = res.body.data as INoteVersion[];
    // Sorted newest-first: version 2 first
    expect(versions[0].version).toBe(2);
    expect(versions[1].version).toBe(1);
    expect(versions[0].title).toBe("Updated Title");
    expect(versions[0].content).toBe("Updated content");
  });

  it("AC-S3: List versions — happy path with 3 versions returns array sorted newest-first", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "v1 Title", "v1 content");
    await updateNote(accessToken, note.id, "v2 Title", "v2 content");
    await updateNote(accessToken, note.id, "v3 Title", "v3 content");

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(3);
    const versions = res.body.data as INoteVersion[];
    // Newest first
    expect(versions[0].version).toBe(3);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(1);
    // Full shape for each entry
    for (const v of versions) {
      expect(v).toHaveProperty("id");
      expect(v).toHaveProperty("noteId", note.id);
      expect(v).toHaveProperty("version");
      expect(v).toHaveProperty("title");
      expect(v).toHaveProperty("content");
      expect(v).toHaveProperty("createdAt");
    }
  });

  it("AC-S4: List versions — single entry when note was just created", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const v = res.body.data[0] as INoteVersion;
    expect(v.version).toBe(1);
  });

  it("AC-S5: List versions — soft-deleted note returns 200 with full version history", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "Note to delete");

    // Soft-delete the note
    await request(app)
      .delete(`/api/notes/${note.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(1);
  });

  it("AC-S6: List versions — non-existent note returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes/00000000-0000-0000-0000-000000000000/versions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S7: List versions — unauthenticated returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get(
      "/api/notes/00000000-0000-0000-0000-000000000000/versions"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes/:id/versions/:versionId — View single version
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/notes/:id/versions/:versionId", () => {
  it("AC-S8: View single version — happy path returns 200 with full version object", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "My Note", "My content");

    // Fetch the version list to get the versionId
    const listRes = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);

    const versionId = (listRes.body.data[0] as INoteVersion).id;

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions/${versionId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: versionId,
      noteId: note.id,
      version: 1,
      title: "My Note",
      content: "My content",
      createdAt: expect.any(String),
    });
  });

  it("AC-S9: View single version — non-existent versionId returns 404 VERSION_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const res = await request(app)
      .get(`/api/notes/${note.id}/versions/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.VERSION_NOT_FOUND);
  });

  it("AC-S10: View single version — cross-note access returns 404 VERSION_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const noteA = await createNote(accessToken, "Note A", "Content A");
    const noteB = await createNote(accessToken, "Note B", "Content B");

    // Get versionId from noteB
    const listB = await request(app)
      .get(`/api/notes/${noteB.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);
    const versionBId = (listB.body.data[0] as INoteVersion).id;

    // Attempt to access noteB's version via noteA's endpoint
    const res = await request(app)
      .get(`/api/notes/${noteA.id}/versions/${versionBId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.VERSION_NOT_FOUND);
  });

  it("AC-S11: View single version — note not found returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S12: View single version — unauthenticated returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get(
      "/api/notes/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notes/:id/versions/:versionId/restore — Restore version
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("POST /api/notes/:id/versions/:versionId/restore", () => {
  it("AC-S13: Restore version — happy path returns 200 with note matching target version content; new version created", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "v1 Title", "v1 content");

    // Create v2 via update
    await updateNote(accessToken, note.id, "v2 Title", "v2 content");

    // Get v1's versionId
    const listRes = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);
    const versions = listRes.body.data as INoteVersion[];
    const v1 = versions.find((v) => v.version === 1);
    expect(v1).toBeDefined();
    const v1Id = v1!.id;

    // Restore to v1
    const restoreRes = await request(app)
      .post(`/api/notes/${note.id}/versions/${v1Id}/restore`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data).toMatchObject({
      id: note.id,
      title: "v1 Title",
      content: "v1 content",
      updatedAt: expect.any(String),
      tags: expect.any(Array),
    });

    // Verify a new version (v3) was created
    const versionsAfter = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(versionsAfter.body.data).toHaveLength(3);
    const newest = (versionsAfter.body.data as INoteVersion[])[0];
    expect(newest.version).toBe(3);
    expect(newest.title).toBe("v1 Title");
    expect(newest.content).toBe("v1 content");
  });

  it("AC-S14: Restore version — history immutability: prior version records remain unchanged after restore", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "v1 Title", "v1 content");
    await updateNote(accessToken, note.id, "v2 Title", "v2 content");

    // Capture versions before restore
    const beforeRes = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);
    const versionsBefore = beforeRes.body.data as INoteVersion[];
    const v1Before = versionsBefore.find((v) => v.version === 1)!;
    const v2Before = versionsBefore.find((v) => v.version === 2)!;

    // Restore v1
    await request(app)
      .post(`/api/notes/${note.id}/versions/${v1Before.id}/restore`)
      .set("Authorization", `Bearer ${accessToken}`);

    // Capture versions after restore
    const afterRes = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);
    const versionsAfter = afterRes.body.data as INoteVersion[];

    // v1 and v2 records must still exist and be unchanged
    const v1After = versionsAfter.find((v) => v.id === v1Before.id);
    const v2After = versionsAfter.find((v) => v.id === v2Before.id);
    expect(v1After).toBeDefined();
    expect(v2After).toBeDefined();
    expect(v1After!.title).toBe(v1Before.title);
    expect(v1After!.content).toBe(v1Before.content);
    expect(v2After!.title).toBe(v2Before.title);
    expect(v2After!.content).toBe(v2Before.content);
    // Only one new version added
    expect(versionsAfter).toHaveLength(3);
  });

  it("AC-S15: Restore version — soft-deleted note is un-deleted; response has deletedAt null", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken, "Note to restore", "Original content");

    // Get v1 id before deleting
    const listRes = await request(app)
      .get(`/api/notes/${note.id}/versions`)
      .set("Authorization", `Bearer ${accessToken}`);
    const v1Id = (listRes.body.data[0] as INoteVersion).id;

    // Soft-delete the note
    await request(app)
      .delete(`/api/notes/${note.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    // Restore v1 of the soft-deleted note
    const restoreRes = await request(app)
      .post(`/api/notes/${note.id}/versions/${v1Id}/restore`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data.deletedAt).toBeNull();
    expect(restoreRes.body.data.id).toBe(note.id);
  });

  it("AC-S16: Restore version — note not found returns 404 NOTE_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .post("/api/notes/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001/restore")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOTE_NOT_FOUND);
  });

  it("AC-S17: Restore version — non-existent versionId returns 404 VERSION_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");
    const note = await createNote(accessToken);

    const res = await request(app)
      .post(`/api/notes/${note.id}/versions/00000000-0000-0000-0000-000000000000/restore`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.VERSION_NOT_FOUND);
  });

  it("AC-S18: Restore version — unauthenticated returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).post(
      "/api/notes/00000000-0000-0000-0000-000000000000/versions/00000000-0000-0000-0000-000000000001/restore"
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});
