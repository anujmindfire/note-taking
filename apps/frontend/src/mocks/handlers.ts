import { http, HttpResponse } from "msw";

const mockNote = {
  id: "note-1",
  userId: "user-1",
  title: "Test Note",
  content: "Test content",
  deletedAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
  tags: [],
};

const mockTag = {
  id: "tag-1",
  userId: "user-1",
  name: "Work",
  color: "#3b82f6",
  noteCount: 1,
  createdAt: "2024-01-01T00:00:00.000Z",
};

export const handlers = [
  http.post("/api/auth/register", () => {
    return HttpResponse.json({ data: { userId: "user-1" } }, { status: 201 });
  }),

  http.post("/api/auth/login", () => {
    return HttpResponse.json(
      {
        data: {
          accessToken: "token-123",
          refreshToken: "refresh-123",
          user: {
            id: "user-1",
            email: "test@example.com",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        },
      },
      { status: 200 }
    );
  }),

  http.post("/api/auth/logout", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/auth/forgot-password", () => {
    return HttpResponse.json({ data: { message: "OTP sent" } }, { status: 200 });
  }),

  http.post("/api/auth/reset-password", () => {
    return HttpResponse.json(
      { data: { message: "Password reset" } },
      { status: 200 }
    );
  }),

  http.get("/api/notes", () => {
    return HttpResponse.json(
      {
        data: [mockNote],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
      { status: 200 }
    );
  }),

  http.post("/api/notes", () => {
    return HttpResponse.json({ data: mockNote }, { status: 201 });
  }),

  http.get("/api/notes/:id", ({ params }) => {
    const { id } = params;
    if (id === "not-found") {
      return HttpResponse.json(
        { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ data: { ...mockNote, id: String(id) } }, { status: 200 });
  }),

  http.patch("/api/notes/:id", async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as { title?: string; content?: string };
    return HttpResponse.json(
      {
        data: {
          ...mockNote,
          id: String(id),
          title: body.title ?? mockNote.title,
          content: body.content ?? mockNote.content,
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  }),

  http.delete("/api/notes/:id", () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/notes/:noteId/tags/:tagId", ({ params }) => {
    const tag = { ...mockTag, id: String(params.tagId) };
    return HttpResponse.json(
      { data: { ...mockNote, id: String(params.noteId), tags: [tag] } },
      { status: 200 }
    );
  }),

  http.delete("/api/notes/:noteId/tags/:tagId", ({ params }) => {
    return HttpResponse.json(
      { data: { ...mockNote, id: String(params.noteId), tags: [] } },
      { status: 200 }
    );
  }),

  http.get("/api/tags", () => {
    return HttpResponse.json({ data: [mockTag] }, { status: 200 });
  }),
];
