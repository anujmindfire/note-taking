Prepare PR for: $ARGUMENTS

Run:

1. pnpm build
2. pnpm lint --max-warnings 0
3. pnpm test

Fix failures before continuing.

Then:

- summarize implementation
- map FRS requirements
- map spec scenarios
- generate commit message
- generate PR description
- summarize testing performed
- list migrations/config changes

Commit format:
feat(scope): description AB#ticket

Ask before:

- git commit
- git push
