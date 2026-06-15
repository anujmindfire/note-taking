import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("../../../repositories/SearchRepository.js", () => ({
  SearchRepository: {
    search: vi.fn(),
  },
}));

import { SearchRepository } from "../../../repositories/SearchRepository.js";
import { SearchService } from "../../../services/SearchService.js";
import type { ISearchResult } from "@noteapp/shared";
import type { TSearchQuery } from "@noteapp/shared";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2024-06-01T10:00:00.000Z");

function makeSearchResult(overrides: Partial<ISearchResult> = {}): ISearchResult {
  return {
    id: "note-uuid-1",
    userId: "user-uuid-1",
    title: "TypeScript Guide",
    content: "This guide covers typescript basics and advanced topics.",
    highlight: "This guide covers <mark>typescript</mark> basics and advanced topics.",
    deletedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tags: [],
    ...overrides,
  };
}

const defaultQuery: TSearchQuery = {
  q: "typescript",
  page: 1,
  limit: 20,
  tagId: [],
};

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// SearchService.search
// ---------------------------------------------------------------------------

describe("SearchService.search", () => {
  it("AC-S1: match in content — returns result with highlight containing <mark> tags", async () => {
    const result = makeSearchResult();
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [result], total: 1 });

    const response = await SearchService.search("user-uuid-1", defaultQuery);

    expect(SearchRepository.search).toHaveBeenCalledWith({
      userId: "user-uuid-1",
      q: "typescript",
      page: 1,
      limit: 20,
      tagIds: [],
    });
    expect(response.results).toHaveLength(1);
    expect(response.results[0].highlight).toContain("<mark>typescript</mark>");
    expect(response.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it("AC-S4: no results — returns empty array with meta.total=0 and totalPages=0", async () => {
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [], total: 0 });

    const query: TSearchQuery = { ...defaultQuery, q: "zzznomatch" };
    const response = await SearchService.search("user-uuid-1", query);

    expect(response.results).toEqual([]);
    expect(response.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("AC-S9: soft-deleted notes excluded — repository returns only active notes, service passes them through", async () => {
    // The repository filters deletedAt internally; the service receives only active results.
    const activeResult = makeSearchResult({ id: "active-note-uuid" });
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [activeResult], total: 1 });

    const response = await SearchService.search("user-uuid-1", defaultQuery);

    expect(response.results).toHaveLength(1);
    expect(response.results[0].id).toBe("active-note-uuid");
    expect(response.results[0].deletedAt).toBeNull();
  });

  it("AC-S10: cross-user isolation — search passes correct userId to repository", async () => {
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [], total: 0 });

    await SearchService.search("user-uuid-B", defaultQuery);

    expect(SearchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-uuid-B" })
    );
    expect(SearchRepository.search).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-uuid-A" })
    );
  });

  it("AC-S11: pagination first page — returns 2 results with correct meta for 5 total", async () => {
    const results = [
      makeSearchResult({ id: "note-uuid-1" }),
      makeSearchResult({ id: "note-uuid-2" }),
    ];
    vi.mocked(SearchRepository.search).mockResolvedValue({ results, total: 5 });

    const query: TSearchQuery = { ...defaultQuery, page: 1, limit: 2 };
    const response = await SearchService.search("user-uuid-1", query);

    expect(response.results).toHaveLength(2);
    expect(response.meta).toEqual({ total: 5, page: 1, limit: 2, totalPages: 3 });
    expect(SearchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 2 })
    );
  });

  it("AC-S12: pagination beyond last page — returns empty data array with meta.total=3", async () => {
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [], total: 3 });

    const query: TSearchQuery = { ...defaultQuery, page: 10, limit: 20 };
    const response = await SearchService.search("user-uuid-1", query);

    expect(response.results).toEqual([]);
    expect(response.meta).toEqual({ total: 3, page: 10, limit: 20, totalPages: 1 });
  });

  it("AC-S13: relevance ordering — service preserves the order returned by the repository", async () => {
    const highRankResult = makeSearchResult({
      id: "high-rank-note",
      highlight: "<mark>term</mark> appears <mark>term</mark> multiple <mark>term</mark> times",
    });
    const lowRankResult = makeSearchResult({
      id: "low-rank-note",
      highlight: "Only one <mark>term</mark> here",
    });
    // Repository returns results pre-sorted by ts_rank DESC
    vi.mocked(SearchRepository.search).mockResolvedValue({
      results: [highRankResult, lowRankResult],
      total: 2,
    });

    const response = await SearchService.search("user-uuid-1", defaultQuery);

    expect(response.results[0].id).toBe("high-rank-note");
    expect(response.results[1].id).toBe("low-rank-note");
  });

  it("AC-S14: tag filter — passes tagIds to repository search call", async () => {
    const taggedResult = makeSearchResult({
      id: "tagged-note-uuid",
      tags: [
        {
          id: "tag-uuid-1",
          userId: "user-uuid-1",
          name: "Work",
          color: null,
          noteCount: 1,
          createdAt: now.toISOString(),
        },
      ],
    });
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [taggedResult], total: 1 });

    const query: TSearchQuery = { ...defaultQuery, tagId: ["tag-uuid-1"] };
    const response = await SearchService.search("user-uuid-1", query);

    expect(SearchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: ["tag-uuid-1"] })
    );
    expect(response.results).toHaveLength(1);
    expect(response.results[0].tags[0]?.id).toBe("tag-uuid-1");
  });

  it("AC-S11 meta.totalPages: Math.ceil(total/limit) computed correctly for non-divisible totals", async () => {
    vi.mocked(SearchRepository.search).mockResolvedValue({ results: [], total: 7 });

    const query: TSearchQuery = { ...defaultQuery, page: 2, limit: 3 };
    const response = await SearchService.search("user-uuid-1", query);

    // Math.ceil(7/3) = 3
    expect(response.meta.totalPages).toBe(3);
    expect(response.meta.page).toBe(2);
    expect(response.meta.limit).toBe(3);
    expect(response.meta.total).toBe(7);
  });
});
