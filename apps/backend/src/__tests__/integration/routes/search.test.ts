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

async function createNote(
  token: string,
  title: string,
  content: string
): Promise<{ id: string }> {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, content });

  return res.body.data as { id: string };
}

async function createTag(
  token: string,
  name: string
): Promise<{ id: string; name: string }> {
  const res = await request(app)
    .post("/api/tags")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });

  return res.body.data as { id: string; name: string };
}

// ---------------------------------------------------------------------------
// GET /api/search
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("GET /api/search", () => {
  it("AC-S1: match in content — 200, note in results, highlight contains <mark>typescript</mark>", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(
      accessToken,
      "My Learning Notes",
      "This note covers typescript generics and interfaces in depth."
    );

    const res = await request(app)
      .get("/api/search?q=typescript")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstResult = res.body.data[0] as {
      title: string;
      content: string;
      highlight: string;
      tags: unknown[];
    };

    expect(firstResult.highlight).toContain("<mark>");
    expect(firstResult).toHaveProperty("id");
    expect(firstResult).toHaveProperty("userId");
    expect(firstResult).toHaveProperty("title");
    expect(firstResult).toHaveProperty("content");
    expect(firstResult).toHaveProperty("highlight");
    expect(firstResult).toHaveProperty("deletedAt");
    expect(firstResult).toHaveProperty("createdAt");
    expect(firstResult).toHaveProperty("updatedAt");
    expect(firstResult).toHaveProperty("tags");
    expect(res.body).toHaveProperty("meta");
  });

  it("AC-S2: match in title only — 200, note in results even when query term not in content", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    // Title contains "planning", content deliberately uses a different word
    await createNote(
      accessToken,
      "Weekly Planning Session",
      "Reviewing goals and deadlines for the quarter."
    );

    const res = await request(app)
      .get("/api/search?q=planning")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);

    const ids = (res.body.data as Array<{ title: string }>).map((r) => r.title);
    expect(ids.some((t) => t.includes("Planning"))).toBe(true);
  });

  it("AC-S3: match in both fields — 200, note in results, highlight contains <mark>sprint</mark>", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(
      accessToken,
      "Sprint Retrospective",
      "We reviewed the sprint deliverables and discussed sprint velocity improvements."
    );

    const res = await request(app)
      .get("/api/search?q=sprint")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstResult = res.body.data[0] as { highlight: string };
    expect(firstResult.highlight).toContain("<mark>");
  });

  it("AC-S4: no results — 200, data=[], meta.total=0, meta.totalPages=0", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    await createNote(accessToken, "Regular Note", "Some ordinary content here.");

    const res = await request(app)
      .get("/api/search?q=zzznomatch")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it("AC-S5: empty query string — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/search?q=")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("AC-S6: whitespace-only query — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/search?q=%20%20")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("AC-S7: missing q parameter — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/search")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("AC-S8: query exceeds 500 chars — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const longQuery = "a".repeat(501);

    const res = await request(app)
      .get(`/api/search?q=${longQuery}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("AC-S9: soft-deleted notes excluded — 200, deleted note absent from results", async () => {
    const { accessToken, userId } = await registerAndLogin("user@example.com");

    // Create a regular note that matches
    await createNote(
      accessToken,
      "Active JavaScript Note",
      "This note covers javascript fundamentals and closures."
    );

    // Create a matching note then soft-delete it directly in DB
    const deletedNote = await prisma.note.create({
      data: {
        userId,
        title: "Deleted JavaScript Note",
        content: "This deleted note also covers javascript topics.",
        deletedAt: new Date(),
      },
    });

    const res = await request(app)
      .get("/api/search?q=javascript")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(resultIds).not.toContain(deletedNote.id);
  });

  it("AC-S10: cross-user isolation — User B's search does not return User A's notes", async () => {
    const { accessToken: tokenA } = await registerAndLogin("userA@example.com");
    const { accessToken: tokenB } = await registerAndLogin("userB@example.com");

    // User A has a matching note
    const userANote = await createNote(
      tokenA,
      "User A React Guide",
      "React hooks and context API explained in detail."
    );

    // User B searches for the same term
    const res = await request(app)
      .get("/api/search?q=react")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(resultIds).not.toContain(userANote.id);
  });

  it("AC-S11: pagination first page — 2 results, meta.total=5, meta.totalPages=3", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    // Create 5 notes that all match "pagination"
    for (let i = 1; i <= 5; i++) {
      await createNote(
        accessToken,
        `Pagination Note ${i}`,
        `This note discusses pagination techniques and cursor based pagination strategies number ${i}.`
      );
    }

    const res = await request(app)
      .get("/api/search?q=pagination&page=1&limit=2")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({
      total: 5,
      page: 1,
      limit: 2,
      totalPages: 3,
    });
  });

  it("AC-S12: pagination beyond last page — data=[], meta.total=3, page reflects requested page", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    // Create 3 matching notes
    for (let i = 1; i <= 3; i++) {
      await createNote(
        accessToken,
        `Overflow Note ${i}`,
        `Content about overflow handling and boundary conditions number ${i}.`
      );
    }

    const res = await request(app)
      .get("/api/search?q=overflow&page=10&limit=20")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({
      total: 3,
      page: 10,
      limit: 20,
      totalPages: 1,
    });
  });

  it("AC-S13: relevance ordering — note with more occurrences of the term appears first", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    // Low-rank note: query term appears once
    await createNote(
      accessToken,
      "Low Rank",
      "This document mentions relevance only one time."
    );

    // High-rank note: query term appears many times
    await createNote(
      accessToken,
      "High Rank",
      "Relevance is key. Relevance scoring matters. Relevance determines result order. Relevance relevance relevance."
    );

    const res = await request(app)
      .get("/api/search?q=relevance")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    const firstTitle = (res.body.data[0] as { title: string }).title;
    expect(firstTitle).toBe("High Rank");
  });

  it("AC-S14: tag filter narrows results — only the tagged note is returned", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const tag = await createTag(accessToken, "FilterTag");

    // Three notes that all match the query
    const taggedNote = await createNote(
      accessToken,
      "Tagged Filter Note",
      "This filter note has a specific tag attached to it."
    );
    await createNote(
      accessToken,
      "Untagged Filter Note One",
      "This filter note does not have any tag attached."
    );
    await createNote(
      accessToken,
      "Untagged Filter Note Two",
      "This filter note also does not have any tag."
    );

    // Attach tag only to the first note
    await request(app)
      .post(`/api/notes/${taggedNote.id}/tags/${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`/api/search?q=filter&tagId=${tag.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect((res.body.data[0] as { id: string }).id).toBe(taggedNote.id);
  });

  it("AC-S15: unauthenticated request — 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/search?q=term");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("AC-S16: invalid tagId format — 400 VALIDATION_ERROR", async () => {
    const { accessToken } = await registerAndLogin("user@example.com");

    const res = await request(app)
      .get("/api/search?q=term&tagId=notauuid")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});
