# Plan — AB-1017: Fix ShareModal Layout Overflow

**Based on spec:** openspec/changes/AB-1017/spec.md
**Spec status:** Approved

---

## Phase 1 — Component Fix

Single file to modify:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `apps/frontend/src/components/ShareModal.tsx` | 4 className changes — layout only, zero logic changes |

### Change 1 — `DialogContent` className

Add `flex flex-col overflow-hidden max-h-[85vh]` to the existing `max-w-lg`:

```tsx
// before
<DialogContent className="max-w-lg">

// after
<DialogContent className="max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
```

**Why it is safe:** The shadcn `DialogContent` uses `grid gap-4` purely to stack its children one-per-row. No `grid-template-columns` or `grid-template-rows` are defined, so the layout is functionally identical to `flex flex-col gap-4`. `overflow-hidden` prevents the container from spilling past its own bounds. `max-h-[85vh]` caps total dialog height at 85 % of the viewport, leaving room for browser chrome on mobile.

### Change 2 — `DialogHeader` className

Prevent the header from compressing under flex constraints:

```tsx
// before
<DialogHeader>

// after
<DialogHeader className="shrink-0">
```

### Change 3 — Generate form `div` className

Prevent the generate form from compressing:

```tsx
// before
<div className="flex items-center gap-2">

// after
<div className="flex shrink-0 items-center gap-2">
```

### Change 4 — Link list wrapper className

Replace the hardcoded `max-h-72` guard with a flex-growth + min-height pattern:

```tsx
// before
<div className="max-h-72 space-y-2 overflow-y-auto">

// after
<div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
```

**Why `min-h-0` is required:** By default, a flex item's `min-height` is `auto`, meaning it will not shrink below its natural content height. Without `min-h-0`, `overflow-y-auto` will never activate — the item just grows to its full content height and overflows the dialog. `flex-1` allows the list to expand into all remaining dialog space once the header and form claim their fixed heights.

---

## Phase 2 — Tests

### Existing tests — no changes required

All 10 existing scenarios in `apps/frontend/src/__tests__/components/ShareModal.test.tsx` (S1–S10 from AB-1014) test component behaviour (API calls, toast messages, badge rendering, clipboard writes). They make no assertions about CSS classes or computed layout, so they pass unchanged after Phase 1.

Run the full test suite to confirm:

```bash
pnpm test
```

### New layout scenarios — manual verification only

The new scenarios S1–S5 from AB-1017 assert viewport-bounded layout behaviour (dialog height ≤ 85 vh, list scrolls, header/form pinned). JSDOM (the test environment) does not compute CSS or layout — `getBoundingClientRect()` always returns zeros, and Tailwind classes are not applied. These scenarios **cannot be meaningfully covered by Vitest unit tests**.

Verification method: start the dev server, open a note with many links (or mock them in the browser), and visually confirm:

- Dialog stays within screen on a short viewport (DevTools → responsive, height ≤ 600 px)
- Link list scrolls when > 4 links are present
- "Share note" heading and "Generate link" button remain visible while scrolling the list

A5 in the spec confirms no Playwright E2E test changes are needed — `share.spec.ts` does not assert dialog dimensions.

---

## Checkpoint

After Phase 1 run all three quality gates in order. Do not proceed past a failure.

```bash
pnpm build          # must exit 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all 10 existing ShareModal tests must be green
```

---

## Risks & Assumptions

| # | Risk / Assumption | Mitigation |
|---|------------------|-----------|
| R1 | `flex flex-col` on `DialogContent` overrides the `grid` stacking — if any other usage of `DialogContent` in the app relied on grid-specific behaviour (e.g. `grid-column: span`), it would break | Change is scoped to the `ShareModal` call site only via the `className` prop; `dialog.tsx` itself is unchanged. Confirmed by search: no other Dialog in the codebase uses grid-spanning children. |
| R2 | `gap-4` is set on `DialogContent` via the base class in `dialog.tsx`. Switching to `flex` preserves the gap because `gap-4` applies to both flex and grid containers | No action needed — gap works identically in both layout models. |
| R3 | Removing `max-h-72` means the link list can now grow taller than 288 px when only a few links exist, consuming more dialog height than before | This is the correct behaviour: the list grows to fit content up to the 85 vh cap, then scrolls. The dialog will never exceed 85 vh regardless of link count. |
