# Tasks — AB-1017: Fix ShareModal Layout Overflow

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Component Fix

- [ ] In `apps/frontend/src/components/ShareModal.tsx`, add `flex flex-col overflow-hidden max-h-[85vh]` to the `DialogContent` className (keep `max-w-lg`)
- [ ] Add `shrink-0` to the `DialogHeader` className
- [ ] Add `shrink-0` to the generate-form `div` className (the `flex items-center gap-2` wrapper)
- [ ] Replace `max-h-72` with `flex-1 min-h-0` on the link list wrapper `div` (keep `space-y-2 overflow-y-auto`)

**Checkpoint 1 (final):**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all 10 existing `ShareModal.test.tsx` scenarios green

---

## Phase 2 — Manual Visual Verification

Layout assertions require a real browser — JSDOM does not compute CSS.

- [ ] Start dev server: `pnpm dev`
- [ ] Open a note in the editor and click Share
- [ ] S1: confirm dialog opens compactly with 0 links ("No links yet." visible; header and generate form visible)
- [ ] S2: confirm 1–4 links render without a scroll bar on the list
- [ ] S3: generate ≥ 5 links; confirm list scrolls while header and "Generate link" button stay pinned at the top
- [ ] S4: while list is scrolled, click "Generate link"; confirm dialog dimensions stay stable and new link appears at top
- [ ] S5: open DevTools → toggle responsive mode → set viewport height to 600 px; confirm dialog fits within screen (≤ 510 px tall) and list scrolls
