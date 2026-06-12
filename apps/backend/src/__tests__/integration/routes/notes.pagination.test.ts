import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../../lib/prisma.js";
import { createApp } from "../../../app.js";
import type { Application } from "express";
import type { INotesPageMeta } from "@noteapp/shared";

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
// Helper: create a note via the API and return its id
// ---------------------------------------------------------------------------

async function createNote(
  accessToken: string,
  title: string,
  content = ""
): Promise<string> {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title, content });
  return res.body.data.id as string;
}

// ---------------------------------------------------------------------------
// GET /api/notes — pagination, sorting, tag filtering
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/notes — pagination, sorting, and tag filtering", () => {
  // -------------------------------------------------------------------------
  // P1: Default params — 200 with data and meta
  // -------------------------------------------------------------------------

  it("AC-P1: default params — 200 with data array and meta object", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(accessToken, "Note A");
    await createNote(accessToken, "Note B");

    const res = await request(app)
      .get("/api/notes")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(2);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(2);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(20);
    expect(meta.totalPages).toBe(1);
  });

  // -------------------------------------------------------------------------
  // P2: page=2&limit=2 with 3 notes — second page has 1 note
  // -------------------------------------------------------------------------

  it("AC-P2: page=2&limit=2 with 3 notes — second page has 1 note", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(accessToken, "Note 1");
    await createNote(accessToken, "Note 2");
    await createNote(accessToken, "Note 3");

    const res = await request(app)
      .get("/api/notes?page=2&limit=2")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(3);
    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(2);
    expect(meta.totalPages).toBe(2);
  });

  // -------------------------------------------------------------------------
  // P3: page=99 beyond last page — 200, empty data, correct total
  // -------------------------------------------------------------------------

  it("AC-P3: page=99 beyond last page — 200 with empty data and correct total", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(accessToken, "Only Note");

    const res = await request(app)
      .get("/api/notes?page=99&limit=20")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(0);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(1);
    expect(meta.page).toBe(99);
    expect(meta.totalPages).toBe(1);
  });

  // -------------------------------------------------------------------------
  // P4: page=0 — 400 VALIDATION_ERROR
  // -------------------------------------------------------------------------

  it("AC-P4: page=0 — 400 VALIDATION_ERROR with fields containing 'page'", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?page=0")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("page");
  });

  // -------------------------------------------------------------------------
  // P5: page=-1 — 400 VALIDATION_ERROR
  // -------------------------------------------------------------------------

  it("AC-P5: page=-1 — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?page=-1")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // -------------------------------------------------------------------------
  // P6: limit=0 — 400 VALIDATION_ERROR
  // -------------------------------------------------------------------------

  it("AC-P6: limit=0 — 400 VALIDATION_ERROR with fields containing 'limit'", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?limit=0")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toContain("limit");
  });

  // -------------------------------------------------------------------------
  // P7: limit=101 — 400 VALIDATION_ERROR (exceeds max 100)
  // -------------------------------------------------------------------------

  it("AC-P7: limit=101 — 400 VALIDATION_ERROR (exceeds max 100)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?limit=101")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // -------------------------------------------------------------------------
  // P8: missing auth — 401 UNAUTHORIZED
  // -------------------------------------------------------------------------

  it("AC-P8: missing auth — 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/notes");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  // -------------------------------------------------------------------------
  // P9: sortBy=createdAt&sortDir=desc — newest note first
  // -------------------------------------------------------------------------

  it("AC-P9: sortBy=createdAt&sortDir=desc — newest note is first in result", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const idOld = await createNote(accessToken, "Oldest Note");
    // Small pause to ensure distinct createdAt timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
    const idNew = await createNote(accessToken, "Newest Note");

    const res = await request(app)
      .get("/api/notes?sortBy=createdAt&sortDir=desc")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(ids[0]).toBe(idNew);
    expect(ids[1]).toBe(idOld);
  });

  // -------------------------------------------------------------------------
  // P10: sortBy=createdAt&sortDir=asc — oldest note first
  // -------------------------------------------------------------------------

  it("AC-P10: sortBy=createdAt&sortDir=asc — oldest note is first in result", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const idOld = await createNote(accessToken, "Oldest Note");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const idNew = await createNote(accessToken, "Newest Note");

    const res = await request(app)
      .get("/api/notes?sortBy=createdAt&sortDir=asc")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(ids[0]).toBe(idOld);
    expect(ids[1]).toBe(idNew);
  });

  // -------------------------------------------------------------------------
  // P11: sortBy=updatedAt&sortDir=desc — most recently updated first
  // -------------------------------------------------------------------------

  it("AC-P11: sortBy=updatedAt&sortDir=desc — most recently updated note is first", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    // Create two notes directly via Prisma with controlled timestamps
    const olderTime = new Date("2024-01-01T10:00:00.000Z");
    const newerTime = new Date("2024-01-01T11:00:00.000Z");

    const olderNote = await prisma.note.create({
      data: { userId, title: "Older Updated", content: "", createdAt: olderTime, updatedAt: olderTime },
    });
    const newerNote = await prisma.note.create({
      data: { userId, title: "Newer Updated", content: "", createdAt: olderTime, updatedAt: newerTime },
    });

    const res = await request(app)
      .get("/api/notes?sortBy=updatedAt&sortDir=desc")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(ids[0]).toBe(newerNote.id);
    expect(ids[1]).toBe(olderNote.id);
  });

  // -------------------------------------------------------------------------
  // P12: sortBy=title — 400 VALIDATION_ERROR (invalid sortBy value)
  // -------------------------------------------------------------------------

  it("AC-P12: sortBy=title — 400 VALIDATION_ERROR (invalid sortBy value)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?sortBy=title")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // -------------------------------------------------------------------------
  // P13: sortDir=random — 400 VALIDATION_ERROR (invalid sortDir value)
  // -------------------------------------------------------------------------

  it("AC-P13: sortDir=random — 400 VALIDATION_ERROR (invalid sortDir value)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?sortDir=random")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // -------------------------------------------------------------------------
  // P14: tagId filter — only tagged note returned
  // -------------------------------------------------------------------------

  it("AC-P14: tagId filter — only the note with that tag is returned", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const taggedNoteId = await createNote(accessToken, "Tagged Note");
    await createNote(accessToken, "Untagged Note");

    const tag = await prisma.tag.create({
      data: { userId, name: "work", normalizedName: "work" },
    });
    await prisma.noteTag.create({
      data: { noteId: taggedNoteId, tagId: tag.id },
    });

    const res = await request(app)
      .get(`/api/notes?tagId=${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(taggedNoteId);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(1);
  });

  // -------------------------------------------------------------------------
  // P15: two tagIds — notes with EITHER tag returned (OR logic)
  // -------------------------------------------------------------------------

  it("AC-P15: two tagIds — notes with EITHER tag are returned (OR logic)", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    const noteAId = await createNote(accessToken, "Note with Tag A");
    const noteBId = await createNote(accessToken, "Note with Tag B");
    await createNote(accessToken, "Note with no tag");

    const tagA = await prisma.tag.create({
      data: { userId, name: "tagA", normalizedName: "taga" },
    });
    const tagB = await prisma.tag.create({
      data: { userId, name: "tagB", normalizedName: "tagb" },
    });
    await prisma.noteTag.create({ data: { noteId: noteAId, tagId: tagA.id } });
    await prisma.noteTag.create({ data: { noteId: noteBId, tagId: tagB.id } });

    const res = await request(app)
      .get(`/api/notes?tagId=${tagA.id}&tagId=${tagB.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const returnedIds = (res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(returnedIds).toContain(noteAId);
    expect(returnedIds).toContain(noteBId);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(2);
  });

  // -------------------------------------------------------------------------
  // P16: non-existent tagId (valid UUID) — 200 empty
  // -------------------------------------------------------------------------

  it("AC-P16: non-existent tagId (valid UUID) — 200 with empty data", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(accessToken, "Some Note");

    const fakeTagId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app)
      .get(`/api/notes?tagId=${fakeTagId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(0);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // P17: other user's tagId — 200 empty (cross-user isolation)
  // -------------------------------------------------------------------------

  it("AC-P17: other user's tagId — 200 empty (cross-user tag isolation)", async () => {
    const { accessToken: tokenA, userId: userAId } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB, userId: userBId } = await registerAndLogin("userB@example.com");

    // User B creates a note and a tag, attaches the tag to the note
    const noteBId = await createNote(tokenB, "User B Note");
    const tagB = await prisma.tag.create({
      data: { userId: userBId, name: "bTag", normalizedName: "btag" },
    });
    await prisma.noteTag.create({ data: { noteId: noteBId, tagId: tagB.id } });

    // User A creates their own note (no tags)
    await createNote(tokenA, "User A Note");

    // User A queries with User B's tag ID — should get 0 results
    const res = await request(app)
      .get(`/api/notes?tagId=${tagB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(0);

    // Suppress unused variable warning
    void userAId;
  });

  // -------------------------------------------------------------------------
  // P18: tagId=notauuid — 400 VALIDATION_ERROR (invalid UUID format)
  // -------------------------------------------------------------------------

  it("AC-P18: tagId=notauuid — 400 VALIDATION_ERROR (invalid UUID format)", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/notes?tagId=notauuid")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // -------------------------------------------------------------------------
  // P19: soft-deleted note tagged — not returned even with tagId filter
  // -------------------------------------------------------------------------

  it("AC-P19: soft-deleted note with tag — not returned even when filtering by that tagId", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    // Create an active note and a soft-deleted note
    const activeNoteId = await createNote(accessToken, "Active Note");
    const deletedNote = await prisma.note.create({
      data: { userId, title: "Deleted Tagged Note", content: "", deletedAt: new Date() },
    });

    const tag = await prisma.tag.create({
      data: { userId, name: "deletedtag", normalizedName: "deletedtag" },
    });

    // Attach the tag to both notes
    await prisma.noteTag.create({ data: { noteId: activeNoteId, tagId: tag.id } });
    await prisma.noteTag.create({ data: { noteId: deletedNote.id, tagId: tag.id } });

    const res = await request(app)
      .get(`/api/notes?tagId=${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(activeNoteId);

    const returnedIds = (res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(returnedIds).not.toContain(deletedNote.id);
  });

  // -------------------------------------------------------------------------
  // P20: pagination + tag filter: meta.total reflects filtered count
  // -------------------------------------------------------------------------

  it("AC-P20: pagination + tag filter — meta.total reflects only filtered note count", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    // Create 3 tagged notes and 2 untagged notes
    const tagged1 = await createNote(accessToken, "Tagged Note 1");
    const tagged2 = await createNote(accessToken, "Tagged Note 2");
    const tagged3 = await createNote(accessToken, "Tagged Note 3");
    await createNote(accessToken, "Untagged Note 1");
    await createNote(accessToken, "Untagged Note 2");

    const tag = await prisma.tag.create({
      data: { userId, name: "filter", normalizedName: "filter" },
    });
    await prisma.noteTag.createMany({
      data: [
        { noteId: tagged1, tagId: tag.id },
        { noteId: tagged2, tagId: tag.id },
        { noteId: tagged3, tagId: tag.id },
      ],
    });

    // Fetch page 1 with limit 2 and tag filter
    const res = await request(app)
      .get(`/api/notes?tagId=${tag.id}&page=1&limit=2`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const meta = res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(3);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(2);
    expect(meta.totalPages).toBe(2);
  });

  // -------------------------------------------------------------------------
  // P21: sort + pagination: ordering preserved on page 2
  // -------------------------------------------------------------------------

  it("AC-P21: sort + pagination — ordering is preserved across pages", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    // Create 3 notes with controlled timestamps via Prisma to guarantee ordering
    const time1 = new Date("2024-01-01T09:00:00.000Z");
    const time2 = new Date("2024-01-01T10:00:00.000Z");
    const time3 = new Date("2024-01-01T11:00:00.000Z");

    const note1 = await prisma.note.create({
      data: { userId, title: "Oldest", content: "", createdAt: time1, updatedAt: time1 },
    });
    const note2 = await prisma.note.create({
      data: { userId, title: "Middle", content: "", createdAt: time2, updatedAt: time2 },
    });
    const note3 = await prisma.note.create({
      data: { userId, title: "Newest", content: "", createdAt: time3, updatedAt: time3 },
    });

    // Sort asc by createdAt, page 1 limit 2 → [oldest, middle]
    const page1Res = await request(app)
      .get("/api/notes?sortBy=createdAt&sortDir=asc&page=1&limit=2")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data).toHaveLength(2);
    const page1Ids = (page1Res.body.data as Array<{ id: string }>).map((n) => n.id);
    expect(page1Ids[0]).toBe(note1.id);
    expect(page1Ids[1]).toBe(note2.id);

    // Page 2 → [newest]
    const page2Res = await request(app)
      .get("/api/notes?sortBy=createdAt&sortDir=asc&page=2&limit=2")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data).toHaveLength(1);
    expect(page2Res.body.data[0].id).toBe(note3.id);

    const meta = page2Res.body.meta as INotesPageMeta;
    expect(meta.total).toBe(3);
    expect(meta.page).toBe(2);
    expect(meta.totalPages).toBe(2);
  });
});
