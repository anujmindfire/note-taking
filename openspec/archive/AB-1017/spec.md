# Spec — AB-1017: Fix ShareModal Layout Overflow

**Status:** Draft — awaiting approval
**Ticket:** AB-1017
**Branch:** feature/frontend/AB-1017-fix-share-modal-overflow
**FRS References:** §4.5.1
**SDS References:** §3.1 (State Division Matrix)
**Layer:** Frontend only
**Depends on:** AB-1014 (Frontend — Share modal + active links)

---

## Summary

The `ShareModal` dialog grows past the viewport height when a note accumulates many share links. The root cause is that `DialogContent` (shadcn) uses a `grid` layout with no viewport-height cap; the inner link list's `max-h-72` guard only limits the list itself, not the combined dialog height (header + generate form + list + 48 px of dialog padding). On viewports ≤ ~600 px, or when there are enough links to push total dialog height beyond the screen, the modal overflows and the bottom controls become unreachable. The fix restructures `DialogContent` to use `flex flex-col max-h-[85vh]` so the dialog is viewport-bounded, and changes the link list to `flex-1 min-h-0 overflow-y-auto` so it fills the remaining space and scrolls gracefully while the header and generate form stay pinned at the top.

---

## In Scope

- Add `flex flex-col overflow-hidden max-h-[85vh]` to the `ShareModal`'s `DialogContent` className
- Replace `max-h-72 space-y-2 overflow-y-auto` on the link list wrapper with `flex-1 min-h-0 space-y-2 overflow-y-auto`
- Add `shrink-0` to the `DialogHeader` and the generate-form `div` so they never compress when the dialog is height-constrained
- Verify the modal remains correctly sized when 0 links exist (dialog is compact, no dead space)

## Out of Scope

- Showing the full share URL as inline text in the modal (separate ticket if needed)
- `SharedNotePage` changes
- Any backend or shared-package changes
- Changes to any other dialog in the application

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | Replacing the `grid` layout class with `flex flex-col` on `DialogContent` is safe — shadcn's grid in this context has no explicit `grid-template-*` rules, so children already stack one-per-row with `gap-4`, which is identical to `flex-col gap-4` | Code inspection of `apps/frontend/src/components/ui/dialog.tsx` |
| A2 | `85vh` is an appropriate cap — it leaves room for browser chrome on mobile and keeps the dialog visually centered without clipping | Standard shadcn dialog practice |
| A3 | `min-h-0` is required on the link list flex child to allow it to shrink below its natural content height; without it a flex item will not scroll even with `overflow-y-auto` | CSS flexbox spec |
| A4 | The `DialogContent` className is passed through as a prop; modifying only the `ShareModal` call site does not affect any other dialog in the app | Confirmed by code search — `DialogContent` is used in multiple places |
| A5 | No Playwright E2E test changes are needed — `share.spec.ts` does not assert dialog dimensions | AB-1016 test review |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Modal opens with 0 links | Note has no share links; viewport ≥ 600 px | User clicks Share | Dialog opens; empty-state text "No links yet." is visible; dialog height is compact (shrinks to fit content, does not fill 85 vh); generate form and header are fully visible | §4.5.1 AC1 | — |
| S2 | Modal opens with 1–4 links | Note has 1–4 non-revoked links | User clicks Share | All link rows visible without a scroll bar on the list; dialog fits naturally within viewport; no overflow | §4.5.1 AC4 | — |
| S3 | Modal with ≥ 5 links — list scrolls, header and form stay pinned | Note has ≥ 5 non-revoked links | User clicks Share | Dialog height is capped (≤ 85 vh); header ("Share note") and generate form are pinned at the top; link list scrolls vertically within the remaining space; no content is clipped outside the dialog bounds | §4.5.1 AC1, AC4 | — |
| S4 | New link generated while list is scrolled | ≥ 5 links visible; user has scrolled list to bottom | User clicks "Generate link" | New link appears at the top of the list (list scrolls back to top or resets); dialog dimensions remain stable (no viewport overflow); generate form remains accessible | §4.5.1 AC1, AC2 | — |
| S5 | Modal on small viewport (≤ 600 px height) | Viewport height is 600 px; note has ≥ 5 links | User clicks Share | Dialog fits within viewport (≤ 85 vh = 510 px); link list scrolls; header and generate form are visible and interactive | §4.5.1 AC1 | — |

---

## API Contract

No new or modified endpoints. This ticket touches only the layout of the `ShareModal` component.

---

## Database Changes

None.

---

## Shared Package Changes

None.

---

## Architecture Notes

### Root cause

`DialogContent` in `apps/frontend/src/components/ui/dialog.tsx` applies `grid … gap-4 … p-6` with no height constraint. The `max-h-72 overflow-y-auto` on the link list div caps the list at 288 px, but the total dialog height = `p-6` (48 px) + `DialogHeader` (~48 px) + generate form (~48 px) + list (up to 288 px) ≈ 432 px. On viewports shorter than ~432 px, or once paddings and shadows push it further, the dialog exceeds the screen.

### Fix — two targeted changes to `ShareModal.tsx`

**1. `DialogContent` className** — add `flex flex-col overflow-hidden max-h-[85vh]`:

```tsx
// before
<DialogContent className="max-w-lg">

// after
<DialogContent className="max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
```

`flex flex-col` replaces the implicit single-column `grid` stacking (behaviour is identical for this layout). `overflow-hidden` prevents the container itself from spilling. `max-h-[85vh]` caps total height at 85 % of the viewport.

**2. `DialogHeader` and generate form** — add `shrink-0` so they are never compressed:

```tsx
<DialogHeader className="shrink-0">
  <DialogTitle>Share note</DialogTitle>
</DialogHeader>

<div className="flex shrink-0 items-center gap-2">
  {/* generate form content unchanged */}
</div>
```

**3. Link list wrapper** — replace hardcoded `max-h-72` with flex growth + `min-h-0`:

```tsx
// before
<div className="max-h-72 space-y-2 overflow-y-auto">

// after
<div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
```

`flex-1` allows the list to expand into available dialog space. `min-h-0` is required by the CSS flexbox spec to allow the item to shrink below its natural height and enable `overflow-y-auto` to activate.

### Files changed

| File | Change |
|------|--------|
| `apps/frontend/src/components/ShareModal.tsx` | `DialogContent` className, `DialogHeader` className, generate form `div` className, link list `div` className — layout only, no logic changes |
