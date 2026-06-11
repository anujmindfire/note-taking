# apps/frontend — Rules

## State architecture
- Server state (API data): TanStack Query ONLY
- UI state (sidebar, preferences): Zustand ONLY
- Form state: React Hook Form + Zod resolver
- Never use useState for server data

## File layout
```
src/
  components/   reusable UI components (PascalCase.tsx)
  pages/        route-level components (LoginPage.tsx, NotesPage.tsx)
  hooks/        TanStack Query hooks (useNotes.ts, useAuth.ts)
  stores/       Zustand stores (authStore.ts)
  lib/
    api.ts      axios instance with auth interceptors
```

## Naming
- Components: PascalCase (NoteCard.tsx)
- Hooks: camelCase + `use` prefix (useNotes.ts)
- Stores: camelCase + `Store` suffix (authStore.ts)

## Types
- Import ALL types from `@noteapp/shared`
- Never define duplicate interfaces here

## API
- All requests via `lib/api.ts` axios instance
- Base URL: `/api` (proxied to backend by Vite in dev)
- Auth header: `Authorization: Bearer <accessToken>`
- On 401: clear auth store → redirect to /login
