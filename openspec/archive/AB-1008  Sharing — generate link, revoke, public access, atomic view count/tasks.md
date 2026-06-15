# Tasks — AB-1008: Sharing — Generate Link, Revoke, Public Access, Atomic View Count

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Add `ISharedLinkResponse` interface to `packages/shared/src/types/index.ts`
- [ ] Add `createShareLinkSchema` and `TCreateShareLinkInput` to `packages/shared/src/schemas/index.ts`
- [ ] Add `SHARE_NOT_FOUND` (404), `SHARE_REVOKED` (403), `SHARE_EXPIRED` (410) to `packages/shared/src/errors.ts`
- [ ] Verify `ISharedLinkResponse`, `createShareLinkSchema`, `TCreateShareLinkInput` are re-exported from `packages/shared/src/index.ts` (add explicit exports if missing)

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Add `SharedLink` model to `apps/backend/prisma/schema.prisma` (fields: `id`, `noteId`, `token`, `expiresAt?`, `revokedAt?`, `viewCount`, `createdAt`; relation to `Note` with `onDelete: Cascade`; indexes: `@@index([token])`, `@@index([noteId])`; `token @unique`)
- [ ] Add `sharedLinks SharedLink[]` back-reference to `Note` model in `schema.prisma`
- [ ] Run migration: `pnpm --filter backend prisma migrate dev --name add_shared_link`
- [ ] Verify Prisma client regenerated: `pnpm --filter backend prisma generate`

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Repository Layer

- [ ] Create `apps/backend/src/repositories/ShareLinkRepository.ts`
- [ ] Define internal `IShareLinkRecord` type (all Date fields as `Date`, not strings)
- [ ] Define internal `IShareLinkWithNote` type extending `IShareLinkRecord` with full `note` object (title, content, userId, deletedAt, createdAt, updatedAt, tags with noteCount)
- [ ] Copy `noteInclude` const (same shape as `NoteRepository.ts`) for use in `findByToken`
- [ ] Implement `create(data: { noteId, token, expiresAt })` — `prisma.sharedLink.create`; returns `IShareLinkRecord`
- [ ] Implement `findAllByNoteId(noteId)` — `prisma.sharedLink.findMany` ordered by `createdAt desc`; returns `IShareLinkRecord[]`
- [ ] Implement `findByIdForOwner(id, userId)` — `prisma.sharedLink.findFirst({ where: { id, note: { userId } } })`; no `deletedAt` filter; returns `IShareLinkRecord | null`
- [ ] Implement `findByToken(token)` — `prisma.sharedLink.findFirst({ where: { token }, include: { note: { include: noteInclude } } })`; returns `IShareLinkWithNote | null`
- [ ] Implement `revoke(id)` — `prisma.sharedLink.update({ data: { revokedAt: new Date() } })`; returns `IShareLinkRecord`
- [ ] Implement `incrementViewCount(id)` — `prisma.sharedLink.update({ data: { viewCount: { increment: 1 } } })`; returns `void`; uses atomic Prisma `increment` operator
- [ ] Export `type { IShareLinkRecord, IShareLinkWithNote }` from the file
- [ ] Verify: no business logic in repository — pure data access only
- [ ] Verify: all Prisma results mapped through `mapRecord` / `mapWithNote` helpers; no raw Prisma objects returned

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Create `apps/backend/src/services/ShareLinkService.ts`
- [ ] Add file-private `mapShareLinkToResponse(link: IShareLinkRecord): ISharedLinkResponse` — converts Date fields to ISO strings
- [ ] Add file-private `mapNoteToResponse(note: IShareLinkWithNote['note']): INoteResponse` — same shape as TagService's `mapNoteToResponse`
- [ ] Implement `generateLink(noteId, userId, data)`:
  - [ ] Call `NoteRepository.findByIdAndUserId(noteId, userId)` → null → throw 404 `NOTE_NOT_FOUND` (covers soft-deleted notes automatically)
  - [ ] Generate token: `crypto.randomBytes(32).toString('hex')`
  - [ ] Call `ShareLinkRepository.create({ noteId, token, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null })`
  - [ ] Return `mapShareLinkToResponse(link)`
- [ ] Implement `listLinks(noteId, userId)`:
  - [ ] Call `NoteRepository.findByIdAndUserId(noteId, userId)` → null → throw 404 `NOTE_NOT_FOUND`
  - [ ] Call `ShareLinkRepository.findAllByNoteId(noteId)`
  - [ ] Return `links.map(mapShareLinkToResponse)`
- [ ] Implement `revokeLink(shareId, userId)`:
  - [ ] Call `ShareLinkRepository.findByIdForOwner(shareId, userId)` → null → throw 404 `SHARE_NOT_FOUND`
  - [ ] If `link.revokedAt !== null`: return `mapShareLinkToResponse(link)` (idempotent — no DB write)
  - [ ] Call `ShareLinkRepository.revoke(shareId)`
  - [ ] Return `mapShareLinkToResponse(revoked)`
- [ ] Implement `accessPublicLink(token)` with exact error precedence order:
  - [ ] Call `ShareLinkRepository.findByToken(token)` → null → throw 404 `SHARE_NOT_FOUND`
  - [ ] Check `link.revokedAt !== null` → throw 403 `SHARE_REVOKED`
  - [ ] Check `(link.expiresAt && link.expiresAt < new Date()) || link.note.deletedAt !== null` → throw 410 `SHARE_EXPIRED`
  - [ ] Call `ShareLinkRepository.incrementViewCount(link.id)` (only reached after all checks pass)
  - [ ] Return `mapNoteToResponse(link.note)`
- [ ] Verify: no `prisma` imports anywhere in the service file
- [ ] Verify: no `req`, `res`, or Express types used
- [ ] Verify: `crypto` imported as `import { randomBytes } from 'node:crypto'`

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Route Layer

- [ ] Modify `apps/backend/src/routes/noteRoutes.ts`:
  - [ ] Add imports: `ShareLinkService`, `createShareLinkSchema`, `TCreateShareLinkInput` from their respective modules
  - [ ] Add `POST /:id/shares` handler — `requireAuth`, `validate(createShareLinkSchema)`, calls `ShareLinkService.generateLink`, responds `201 { data: link }`
  - [ ] Add `GET /:id/shares` handler — `requireAuth`, calls `ShareLinkService.listLinks`, responds `200 { data: links }`
- [ ] Create `apps/backend/src/routes/shareRoutes.ts`:
  - [ ] `POST /:shareId/revoke` handler — `requireAuth`, calls `ShareLinkService.revokeLink`, responds `200 { data: link }`
  - [ ] Export `router as shareRoutes`
- [ ] Create `apps/backend/src/routes/publicShareRoutes.ts`:
  - [ ] `GET /:token` handler — NO `requireAuth`, calls `ShareLinkService.accessPublicLink`, responds `200 { data: note }`
  - [ ] Export `router as publicShareRoutes`
- [ ] Modify `apps/backend/src/app.ts`:
  - [ ] Import `shareRoutes` from `./routes/shareRoutes.js`
  - [ ] Import `publicShareRoutes` from `./routes/publicShareRoutes.js`
  - [ ] Mount `app.use('/api/shares', shareRoutes)` before `app.use(notFound)`
  - [ ] Mount `app.use('/api/share', publicShareRoutes)` before `app.use(notFound)`
- [ ] Verify: no business logic in any route handler (no if/else on domain conditions)
- [ ] Verify: no Prisma imports in any route file
- [ ] Verify: `publicShareRoutes.ts` has no `requireAuth` middleware on any handler

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every scenario from spec.md must have at least one test.

**Unit tests** (`apps/backend/src/__tests__/unit/services/ShareLinkService.test.ts`):

- [ ] AC-S1: Generate link — no expiry
- [ ] AC-S2: Generate link — valid future expiresAt
- [ ] AC-S3: Generate link — multiple links same note
- [ ] AC-S6: Generate link — note not found
- [ ] AC-S7: Generate link — note belongs to other user
- [ ] AC-S8: Generate link — note is soft-deleted
- [ ] AC-S10: List links — note has links
- [ ] AC-S11: List links — no links exist
- [ ] AC-S12: List links — includes revoked and expired links
- [ ] AC-S16: Revoke link — happy path
- [ ] AC-S17: Revoke link — already revoked (idempotent)
- [ ] AC-S19: Revoke link — not found
- [ ] AC-S20: Revoke link — belongs to other user's note
- [ ] AC-S22: Public access — valid active link
- [ ] AC-S23: Public access — viewCount increments correctly
- [ ] AC-S24: Public access — token not found
- [ ] AC-S25: Public access — link revoked
- [ ] AC-S26: Public access — link expired
- [ ] AC-S27: Public access — note soft-deleted
- [ ] AC-S29: Public access — error precedence: revoked beats expired

**Integration tests** (`apps/backend/src/__tests__/integration/routes/shareLinks.test.ts`):

- [ ] AC-S1: Generate link — no expiry
- [ ] AC-S2: Generate link — valid future expiresAt
- [ ] AC-S3: Generate link — multiple links same note
- [ ] AC-S4: Generate link — expiresAt in past
- [ ] AC-S5: Generate link — expiresAt exceeds 1-year max
- [ ] AC-S6: Generate link — note not found
- [ ] AC-S7: Generate link — note belongs to other user
- [ ] AC-S8: Generate link — note is soft-deleted
- [ ] AC-S9: Generate link — no auth
- [ ] AC-S10: List links — note has links
- [ ] AC-S11: List links — no links exist
- [ ] AC-S12: List links — includes revoked and expired links
- [ ] AC-S13: List links — note not found
- [ ] AC-S14: List links — note belongs to other user
- [ ] AC-S15: List links — no auth
- [ ] AC-S16: Revoke link — happy path
- [ ] AC-S17: Revoke link — already revoked (idempotent)
- [ ] AC-S18: Revoke link — immediate effect (access after revoke returns 403)
- [ ] AC-S19: Revoke link — not found
- [ ] AC-S20: Revoke link — belongs to other user's note
- [ ] AC-S21: Revoke link — no auth
- [ ] AC-S22: Public access — valid active link
- [ ] AC-S23: Public access — viewCount increments correctly
- [ ] AC-S24: Public access — token not found
- [ ] AC-S25: Public access — link revoked
- [ ] AC-S26: Public access — link expired
- [ ] AC-S27: Public access — note soft-deleted
- [ ] AC-S28: Public access — no auth required
- [ ] AC-S29: Public access — error precedence: revoked beats expired

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on new files (`ShareLinkRepository.ts`, `ShareLinkService.ts`, `shareRoutes.ts`, `publicShareRoutes.ts`)
