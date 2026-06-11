# apps/backend — Rules

## Three-layer architecture — no exceptions
```
Route Handler → parse req, validate (Zod from @noteapp/shared), call service, send response
Service       → business rules only — no req/res, no Prisma
Repository    → ALL Prisma queries — return domain types, never raw Prisma objects
```

## File layout
```
src/
  routes/      one file per domain (authRoutes.ts, noteRoutes.ts, tagRoutes.ts)
  services/    one file per domain (AuthService.ts, NoteService.ts, TagService.ts)
  repositories/ one file per domain (UserRepository.ts, NoteRepository.ts, TagRepository.ts)
  middleware/  errorHandler.ts, auth.ts, validate.ts
  utils/       token.ts
  lib/         prisma.ts
  __tests__/
    unit/services/
    integration/routes/
```

## Error handling
- All errors: `{ error: { code, message, fields? } }`
- Import codes from `@noteapp/shared` — never hardcode strings
- Middleware catches; routes never try/catch

## Testing
- Unit: mock repositories, test services in isolation
- Integration: Supertest + real DB via `TEST_DATABASE_URL`
- One test per AC row: `AC-{id}: {name}`
- Assert error code string: `expect(res.body.error.code).toBe("EMAIL_TAKEN")`

## Prisma rules
- Only in repositories — never in services or routes
- Return plain typed objects from repositories

## JWT
- Access token: 15 min, `JWT_SECRET` env var
- Refresh token: 7 days, stored in DB
- Never hardcode secrets
