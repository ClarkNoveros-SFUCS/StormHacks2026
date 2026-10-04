# Coordination protocol

Several people, each with their own agent, build this repo in parallel. This protocol keeps every agent aware of what's done, what's claimed, and what just merged. Follow it **without being asked**.

## Where the truth lives

| Question | Source of truth | Why there |
|---|---|---|
| What's built on `main`, and where does the code live? | `docs/FEATURES.md` (board + one checklist section per feature) | Lives in the repo, so it updates the moment a PR merges, and every agent reads it locally. |
| Who's working on what *right now*? | GitHub Issues with the `in-progress` label plus an assignee | A claim must be visible to others immediately, before any code merges. |
| What does the feature need to do? | `docs/architecture/*.md` + `CONTEXT.md` | Specs and vocabulary. |
| Where did I leave off? | `docs/worklog/<github-login>/<issue#>-<slug>.md` | Detailed resume notes, one folder per person, so they never conflict. See `docs/worklog/README.md`. |

## 0. One-time setup (each person)

Run `bash scripts/setup.sh` once (inside Claude Code, type `! bash scripts/setup.sh`). It installs the GitHub CLI if needed, logs you in through the browser, and checks you can push to the repo. It's safe to re-run.

If setup hasn't been done, `scripts/agent-sync.sh` prints a `!!!` warning. The agent must relay that one command to the user and not start feature work until it's done.

## 1. Session start (every session, before any work)

1. Run `bash scripts/agent-sync.sh`. If it lists your unfinished worklogs, offer to resume one: switch to its branch and continue from its "Next steps".
   Claude Code runs it automatically through the SessionStart hook; other agents run it by hand. It shows:
   - how far your branch is behind `origin/main`, and what merged since
   - the `docs/FEATURES.md` table from `origin/main`
   - in-progress issues and open PRs
2. If your branch is behind `origin/main`, tell the user what merged and ask before merging `main` in.
3. If your task touches a feature someone else has claimed (an `in-progress` issue assigned to someone else), stop and tell the user. Don't build it in parallel.

## 2. Claim before you code

1. Find the feature's issue (`gh issue list --search "<feature>"`). If none exists, create one using the feature's `docs/FEATURES.md` row and spec link.
2. If it's assigned to someone else, stop and tell the user.
3. Claim it, as your first write action:
   ```bash
   gh issue edit <n> --add-assignee @me --add-label in-progress
   gh issue comment <n> --body "Claimed. Branch: feat/<n>-<slug>. Plan: <one line>."
   ```
4. Branch from fresh main: `git fetch origin && git switch -c feat/<n>-<slug> origin/main`.
5. Create your worklog `docs/worklog/<your-login>/<n>-<slug>.md` from the template in `docs/worklog/README.md` (`gh api user --jq .login` gives your login).

## 3. While working

- **Keep your worklog current.** Update it after each meaningful chunk and always before the session ends, then commit it with the code. "Next steps" must be concrete enough for a fresh agent to continue.
- **Changing a shared contract?** Post a comment on your issue *before* merging. That includes the DB schema, a public function signature in `lib/`, an API route shape, or a `CONTEXT.md` term. Other agents read issue comments.
- **DB migrations** go in `db/migrations/` with a timestamp prefix (`20261003T1530_add_runs.sql`), never a sequence number. That way two branches can't pick the same number.
- **Stay in your lane.** If you need a change in another claimed feature's files, comment on that issue and don't edit them.
- **Open a draft PR early** (`gh pr create --draft`, body includes `Closes #<n>`) so your work shows up in everyone's sync output.

## 4. Finishing (in the same PR)

- [ ] In `docs/FEATURES.md`, edit only your feature's section and board row: tick the boxes, set Status `done`, and fill **Entry points** and **Notes for others** (e.g. "call `matchGuess(promptId, text)` from `lib/matching/match-guess.ts`").
- [ ] If the implementation differs from the spec, update the matching `docs/architecture/*.md`.
- [ ] If you introduced or changed a domain term, update `CONTEXT.md`.
- [ ] Set `Status: done` in your worklog.
- [ ] PR body includes `Closes #<n>`. Merging auto-closes the issue, which removes it from the in-progress list.

## 5. Abandoning or pausing

Remove the claim so the work frees up for others:
```bash
gh issue edit <n> --remove-assignee @me --remove-label in-progress
gh issue comment <n> --body "Unclaimed. State: <what's done, what's left, branch name>."
```
Set `Status: paused` in your worklog and push the branch, so whoever picks it up can read where you stopped.
