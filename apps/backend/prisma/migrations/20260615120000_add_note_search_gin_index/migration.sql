-- CreateIndex (GIN): full-text search on Note(title, content)
CREATE INDEX "note_search_idx" ON "Note" USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
);
