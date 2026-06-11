@AGENTS.md

---

## Permission Model

Always ask [y/n] before:

- Any file write
- `git commit`, `git push`
- DB migration (`prisma migrate dev`, `prisma migrate reset`)

Proceed without asking:

- `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm test`

---

## Environment Files — Hard Prohibition

Claude MUST NOT read, print, or access any `.env` file or secret values:

- Do NOT `cat`, `Read`, or `grep` any `.env`, `.env.local`, `.env.*.local` file
- Do NOT log or echo environment variable values
- Reference only variable **names** (e.g. `JWT_SECRET`), never their values
- If a task requires knowing an env value, ask the user to provide it directly

---

## Context Management

- Run `/clear` between tickets — no exceptions
- At 60k tokens: save progress summary to `session-context.md`, run `/clear`, then resume

---

## Thinking Depth

- Architecture decisions → think hard before starting
- Simple implementation → default thinking

---

## Quality Gates

Run in this order at every checkpoint. Never proceed past a failure.

1. `pnpm build` — 0 errors, 0 warnings
2. `pnpm lint --max-warnings 0`
3. `pnpm test` — all green

---

## Commit Format

```
feat(scope): description AB#ticket
fix(scope): description AB#ticket
```

---

## Branch Naming

```
feature/backend/AB-xxxx-short-name
feature/frontend/AB-xxxx-short-name
```
