import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterEach,
  afterAll,
  beforeEach,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useAutosave } from "../../hooks/useAutosave";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
  // Restore real timers if a test left fake timers running
  vi.useRealTimers();
});
afterAll(() => server.close());

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, null, children)
    );
  };
}

/**
 * Advance fake timers and flush all pending microtasks/promises.
 * waitFor() uses setInterval internally which is also faked, so we must not
 * mix waitFor with fake timers. Instead we advance time and then flush with
 * runAllTimersAsync to let promises settle.
 */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("AC-S4: Edit title — autosave fires PATCH after 2s debounce", async () => {
    vi.useFakeTimers();

    let patchCalled = false;
    let patchBody: Record<string, unknown> = {};

    server.use(
      http.patch("/api/notes/:id", async ({ request }) => {
        patchCalled = true;
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "New Title",
              content: "Test content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Test content" },
      }
    );

    // Activate autosave by calling initLastSaved
    act(() => {
      result.current.initLastSaved("Original Title", "Test content");
    });

    // Change the title — triggers debounce
    rerender({ title: "New Title", content: "Test content" });

    // Advance past the 2s debounce
    await advanceAndFlush(2100);

    expect(patchCalled).toBe(true);
    expect(patchBody).toMatchObject({ title: "New Title", content: "Test content" });
    expect(result.current.saveStatus).toBe("saved");

    vi.useRealTimers();
  }, 10000);

  it("AC-S5: Edit content — autosave fires PATCH after 2s debounce", async () => {
    vi.useFakeTimers();

    let patchCalled = false;
    let patchBody: Record<string, unknown> = {};

    server.use(
      http.patch("/api/notes/:id", async ({ request }) => {
        patchCalled = true;
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "Test Note",
              content: "<p>New content</p>",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Test Note", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Test Note", "Original content");
    });

    rerender({ title: "Test Note", content: "<p>New content</p>" });

    await advanceAndFlush(2100);

    expect(patchCalled).toBe(true);
    expect(patchBody).toMatchObject({ title: "Test Note", content: "<p>New content</p>" });
    expect(result.current.saveStatus).toBe("saved");

    vi.useRealTimers();
  }, 10000);

  it("AC-S6: Edit title and content — single PATCH with both fields", async () => {
    vi.useFakeTimers();

    let patchCallCount = 0;
    let lastPatchBody: Record<string, unknown> = {};

    server.use(
      http.patch("/api/notes/:id", async ({ request }) => {
        patchCallCount++;
        lastPatchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "New Title",
              content: "<p>New content</p>",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    // Change both title and content simultaneously
    rerender({ title: "New Title", content: "<p>New content</p>" });

    await advanceAndFlush(2100);

    // Exactly one PATCH with both updated fields
    expect(patchCallCount).toBe(1);
    expect(lastPatchBody).toMatchObject({
      title: "New Title",
      content: "<p>New content</p>",
    });

    vi.useRealTimers();
  }, 10000);

  it("AC-S7: Rapid typing — debounce resets; single PATCH fires once", async () => {
    vi.useFakeTimers();

    let patchCallCount = 0;

    server.use(
      http.patch("/api/notes/:id", async () => {
        patchCallCount++;
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "Final Title",
              content: "Original content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    // Simulate rapid typing — each keystroke before debounce completes resets the timer
    rerender({ title: "T", content: "Original content" });
    await advanceAndFlush(500); // 500ms — debounce not yet fired

    rerender({ title: "Ti", content: "Original content" });
    await advanceAndFlush(500); // 1000ms total — still not fired

    rerender({ title: "Titl", content: "Original content" });
    await advanceAndFlush(500); // 1500ms total — still not fired

    rerender({ title: "Final Title", content: "Original content" });
    // Advance past full 2s from LAST change
    await advanceAndFlush(2100);

    // Only one PATCH despite multiple rerenders
    expect(patchCallCount).toBe(1);

    vi.useRealTimers();
  }, 10000);

  it("AC-S8: No-op save skipped — no PATCH when content unchanged", async () => {
    vi.useFakeTimers();

    let patchCallCount = 0;

    server.use(
      http.patch("/api/notes/:id", async () => {
        patchCallCount++;
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "Same Title",
              content: "Same content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Same Title", content: "Same content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Same Title", "Same content");
    });

    // Re-render with IDENTICAL values — should NOT trigger PATCH
    rerender({ title: "Same Title", content: "Same content" });

    await advanceAndFlush(2100);
    await advanceAndFlush(500); // extra buffer

    expect(patchCallCount).toBe(0);

    vi.useRealTimers();
  }, 10000);

  it("AC-S9: Pending guard — save deferred while first in-flight", async () => {
    vi.useFakeTimers();

    let callCount = 0;
    let resolveFirst!: () => void;
    // The first request blocks until we release it
    const firstRequestBlocker = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    server.use(
      http.patch("/api/notes/:id", async ({ request }) => {
        callCount++;
        const body = (await request.json()) as Record<string, unknown>;
        if (callCount === 1) {
          await firstRequestBlocker;
        }
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: String(body.title ?? "Test Note"),
              content: String(body.content ?? "Test content"),
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original", "Original content");
    });

    // First edit — triggers debounce then save
    rerender({ title: "First Change", content: "Original content" });
    await advanceAndFlush(2100);

    // First PATCH is now in-flight and blocked; status should be "saving"
    expect(callCount).toBe(1);
    expect(result.current.saveStatus).toBe("saving");

    // Second edit while first is still in-flight
    rerender({ title: "Second Change", content: "Original content" });
    await advanceAndFlush(2100);

    // The pending guard should have blocked a second PATCH from being issued
    expect(callCount).toBe(1);

    // Release the first request
    await act(async () => {
      resolveFirst();
      // Flush remaining timers and microtasks
      await vi.runAllTimersAsync();
    });

    expect(result.current.saveStatus).toBe("saved");

    vi.useRealTimers();
  }, 15000);

  it("AC-S10: Save failure — retry fired after 3s", async () => {
    vi.useFakeTimers();

    let callCount = 0;

    server.use(
      http.patch("/api/notes/:id", async () => {
        callCount++;
        return HttpResponse.json(
          { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    rerender({ title: "New Title", content: "Original content" });

    // Trigger the debounce
    await advanceAndFlush(2100);

    // First call should have fired
    expect(callCount).toBeGreaterThanOrEqual(1);

    // Advance past the 3s retry delay
    await advanceAndFlush(3100);

    // Retry should have fired — 2 total calls
    expect(callCount).toBe(2);

    vi.useRealTimers();
  }, 15000);

  it("AC-S11: Retry succeeds — status becomes 'saved'", async () => {
    vi.useFakeTimers();

    let callCount = 0;

    server.use(
      http.patch("/api/notes/:id", async () => {
        callCount++;
        if (callCount === 1) {
          // Initial attempt fails
          return HttpResponse.json(
            { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
            { status: 404 }
          );
        }
        // Retry succeeds
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "New Title",
              content: "Original content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    rerender({ title: "New Title", content: "Original content" });

    // Trigger debounce + initial attempt
    await advanceAndFlush(2100);
    expect(callCount).toBe(1);

    // Advance past retry delay
    await advanceAndFlush(3100);

    expect(callCount).toBe(2);
    expect(result.current.saveStatus).toBe("saved");

    vi.useRealTimers();
  }, 15000);

  it("AC-S12: Retry fails — save never completes; status is not 'saved' after both attempts fail", async () => {
    vi.useFakeTimers();

    let callCount = 0;

    server.use(
      http.patch("/api/notes/:id", async () => {
        callCount++;
        return HttpResponse.json(
          { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    rerender({ title: "New Title", content: "Original content" });

    // Trigger debounce + initial attempt (fails)
    await advanceAndFlush(2100);
    expect(callCount).toBe(1);

    // Advance past retry delay (retry also fails)
    await advanceAndFlush(3100);
    expect(callCount).toBe(2);

    // After both attempts fail the status is "error" and stays there until the user edits again
    expect(result.current.saveStatus).toBe("error");

    vi.useRealTimers();
  }, 15000);

  it("AC-S13: Resume editing after save failed — debounce resets, new save attempt fires", async () => {
    vi.useFakeTimers();

    let callCount = 0;

    server.use(
      http.patch("/api/notes/:id", async () => {
        callCount++;
        if (callCount <= 2) {
          // First attempt + retry fail
          return HttpResponse.json(
            { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
            { status: 404 }
          );
        }
        // Third attempt (after resume edit) succeeds
        return HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "Resumed Title",
              content: "Original content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    rerender({ title: "New Title", content: "Original content" });

    // Initial attempt fails
    await advanceAndFlush(2100);
    expect(callCount).toBe(1);

    // Retry also fails — hook transitions through "error" state
    await advanceAndFlush(3100);
    expect(callCount).toBe(2);

    // User resumes editing with new content — this triggers the effect which
    // resets "error" to "idle" and sets a fresh debounce
    rerender({ title: "Resumed Title", content: "Original content" });

    // After rerender the status should have reset (not "saved", not "saving")
    expect(result.current.saveStatus).not.toBe("saved");

    // Advance past the new debounce — third PATCH fires and succeeds
    await advanceAndFlush(2100);

    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(result.current.saveStatus).toBe("saved");

    vi.useRealTimers();
  }, 20000);

  it("SDS-c4: No-auth guard — zero PATCH when accessToken is null", async () => {
    vi.useFakeTimers();

    // Override the beforeEach auth with no auth
    useAuthStore.getState().clearAuth();

    let patchCallCount = 0;
    server.use(
      http.patch("/api/notes/:id", async () => {
        patchCallCount++;
        return HttpResponse.json({ data: {} }, { status: 200 });
      })
    );

    const { result, rerender } = renderHook(
      ({ title, content }: { title: string; content: string }) =>
        useAutosave("note-1", title, content),
      {
        wrapper: createWrapper(),
        initialProps: { title: "Original Title", content: "Original content" },
      }
    );

    act(() => {
      result.current.initLastSaved("Original Title", "Original content");
    });

    rerender({ title: "New Title", content: "Original content" });

    await advanceAndFlush(2100);

    expect(patchCallCount).toBe(0);

    vi.useRealTimers();
  }, 10000);
});
