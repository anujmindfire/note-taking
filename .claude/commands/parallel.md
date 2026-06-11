Manage git worktrees for parallel tasks for: $ARGUMENTS

Execution flow:

1. Read openspec/changes/$ARGUMENTS/tasks.md to identify tasks marked [PARALLEL].

2. Propose creating separate git worktrees for the frontend and backend tasks:
   git worktree add <path-to-worktree> -b <branch-name>

3. Instruct the user to open independent workspaces in the created directories.

4. Once both tasks are completed and verified:
   - Commit and push changes on each worktree branch.
   - Remove the worktrees using "git worktree remove".
   - Clean up temporary branches.

Wait for approval before initializing worktrees.

Format: /parallel AB-XXXX-feature-name
