# packages/shared — Rules

## This is the ONLY place for:
- TypeScript interfaces → `src/types/`
- Zod schemas → `src/schemas/`
- Error code constants → `src/errors.ts`

Import everywhere as: `@noteapp/shared`

## Naming
- Interfaces: PascalCase + `I` prefix → `INoteResponse`
- Zod schemas: camelCase + `Schema` suffix → `createNoteSchema`
- Error codes: SCREAMING_SNAKE_CASE → `TAG_NAME_TAKEN`

## Adding to shared
1. Define interface in `src/types/`
2. Define Zod schema in `src/schemas/`
3. Export both from `src/index.ts`
4. Run `pnpm build` in this package before importing elsewhere

## Hard rules
- No business logic here — types and validation only
- No Prisma imports
- No Express imports
- `strict: true` — zero `any`
