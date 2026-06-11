# Git Branch Hygiene

Use this rule before committing, pushing, or creating a branch.

## Branch Scope

- Before staging or committing, check the current branch with `git status -sb` or `git branch --show-current`.
- Confirm the branch name matches the current change scope. If it does not, create or switch to a semantically accurate branch before committing.
- Prefer `codex/{short-feature-description}` for Codex-created branches.
- If a branch was accidentally used for unrelated work, create a correctly named branch from the intended commit, push it, and clean up the misleading branch only when it is safe.

## Branch Context

- When creating a branch for non-trivial work, write a local branch description explaining what the branch is for:
  `git config branch.<branch-name>.description "<purpose>"`
- Keep the description short and durable: mention the feature/fix area, important behavior, and affected surfaces when useful.
- Include the branch name and purpose in the final handoff after pushing.

## Safety

- Do not silently rewrite or delete shared remote branches unless the user has authorized cleanup or the branch is clearly a mistaken duplicate created in the current session.
- If the worktree contains unrelated changes, stage explicit paths and call out what is being committed.
