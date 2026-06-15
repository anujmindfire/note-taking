import type { ISearchResult, INotesPageMeta, TSearchQuery } from "@noteapp/shared";
import { SearchRepository } from "../repositories/SearchRepository.js";

export const SearchService = {
  async search(
    userId: string,
    query: TSearchQuery
  ): Promise<{ results: ISearchResult[]; meta: INotesPageMeta }> {
    const { results, total } = await SearchRepository.search({
      userId,
      q: query.q,
      page: query.page,
      limit: query.limit,
      tagIds: query.tagId,
    });

    const totalPages = Math.ceil(total / query.limit);

    return {
      results,
      meta: { total, page: query.page, limit: query.limit, totalPages },
    };
  },
};
