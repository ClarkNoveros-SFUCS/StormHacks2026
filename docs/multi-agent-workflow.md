# How our agents work together

SYLLABYSS was built by several people at once, each driving their own AI coding agent (mostly Claude Code, sometimes Codex). The agents never talk to each other directly. They coordinate through **shared state that lives in GitHub and in the repo**, and every agent reads it at the start of every session.

This page explains the idea and shows it end to end. The exact rules the agents follow are in [`docs/agents/coordination.md`](agents/coordination.md).

## The idea in one picture

```
 Person A's agent                                        Person B's agent
 ────────────────                                        ────────────────
 session starts ──► scripts/agent-sync.sh ◄── session starts
                         │  reads
                         ▼
        ┌──────────────────────────────────────────┐
        │  GitHub Issues   who claimed what (label  │
        │                  in-progress + assignee)  │
        │  Issue comments  announcements, contract  │
        │                  changes                  │
        │  Open PRs        what's about to land     │
        │  docs/FEATURES.md what's already built    │
        │  docs/worklog/   where each person left   │
        │                  off                      │
        └──────────────────────────────────────────┘
                         ▲  writes
 claim issue ─► branch ─► code + worklog ─► PR ─► merge ─► FEATURES.md ticked
```

An agent "hears" its teammates by reading that state, and "speaks" by writing to it: claiming an issue, commenting on it, updating the board, pushing a worklog. Nobody has to be online at the same time.

## The five pieces

| Piece | Where | What it does |
|---|---|---|
| **Claims** | GitHub Issues: `in-progress` label plus an assignee | "I'm building this." Visible the instant it's set, before any code merges. An agent that finds a feature claimed by someone else stops and tells its user instead of building it twice. |
| **Announcements** | Comments on the issue | Anything others must know *before* it merges: a DB schema change, a `lib/` function signature, an API route shape, a new `CONTEXT.md` term. Agents read issue comments, so this is the cross-agent message channel. |
| **The board** | [`docs/FEATURES.md`](FEATURES.md) | What's built on `main`, with entry points ("call `matchGuess()` from `lib/matching/match-guess.ts`") and notes for the next person. Updated in the same PR as the feature, so it can't drift. |
| **Worklogs** | `docs/worklog/<github-login>/<issue#>-<slug>.md` | Each person's resumable notes: goal, done, next steps, gotchas. One folder per person, so two people never edit the same file and never conflict. A fresh agent on any machine can pick up from it. |
| **The sync script** | `scripts/agent-sync.sh` | Runs automatically when a Claude Code session starts (a `SessionStart` hook in `.claude/settings.json`); other agents run it by hand. It prints how far the branch is behind `main` and what merged, the FEATURES board, all claimed issues, open PRs, and your own unfinished worklogs. |

Why these sources and not one shared file? Each one answers a question at the speed it changes. A claim has to be visible *now*, so it lives in Issues. "What's built" changes only when code merges, so it lives in the repo and updates with the PR. "Where did I leave off" is private to one person, so it gets its own folder.

## A feature, start to finish

1. **Session start.** The hook runs `agent-sync.sh`. The agent sees that `main` moved (and what merged), who claimed what, and any of your worklogs that aren't done. If your branch is behind, it tells you and asks before merging `main` in.
2. **Claim.** Before writing code the agent finds or creates the feature's issue. If it's assigned to someone else, it stops. Otherwise:
   ```bash
   gh issue edit <n> --add-assignee @me --add-label in-progress
   gh issue comment <n> --body "Claimed. Branch: feat/<n>-<slug>. Plan: <one line>."
   git switch -c feat/<n>-<slug> origin/main
   ```
   It also creates the worklog from the template in [`docs/worklog/README.md`](worklog/README.md).
3. **Build.** The agent keeps the worklog current after each chunk of work and commits it with the code. If the work changes something other features depend on, it comments on the issue *first*. DB migrations use timestamp prefixes (`20261003T1530_add_runs.sql`) so two branches can't pick the same number. If it needs a change in someone else's claimed area, it comments on their issue instead of editing their files.
4. **Finish.** The feature's checklist in `docs/FEATURES.md` is ticked, Status set to `done`, Entry points and Notes for others filled in, the worklog set to `done`, and the PR body says `Closes #<n>`. Merging closes the issue, which drops it from the in-progress list every other agent sees.
5. **Pause or abandon.** The agent removes the assignee and label, comments what's done and what's left, and sets the worklog to `paused`, so the work frees up for someone else.

## Where humans stay in charge

- **Review gate.** By default an agent never opens a PR (not even a draft) on its own. It hands over the work, says how to try it, and waits for an explicit "looks good". Approval for one PR doesn't carry over to the next. (A person can switch this off for their own sessions in a private, uncommitted `CLAUDE.local.md`, for example to let an agent work overnight. Teammates still review and merge.)
- **Nobody merges for you.** Agents never merge PRs or push to `main`.
- **No AI attribution.** No `Co-Authored-By` trailers or "Generated with…" lines in commits or PRs. Only the humans are contributors.
- **Prompt, not ask, on anything shared.** Contract changes are announced on the issue before they land.

## Setting it up on a fresh clone

Each teammate runs this once (inside Claude Code, type `! bash scripts/setup.sh`). It installs the GitHub CLI if needed, logs in through the browser, and checks push access. If it hasn't been done, `agent-sync.sh` prints a `!!!` warning and the agent relays that one command before starting work.

The instructions agents actually read are:

| File | Role |
|---|---|
| `AGENTS.md` and `CLAUDE.md` (repo root) | Loaded into every agent session. They carry the short version of the rules and point to the files below. |
| [`docs/agents/coordination.md`](agents/coordination.md) | The full protocol. |
| [`docs/agents/issue-tracker.md`](agents/issue-tracker.md), [`docs/agents/triage-labels.md`](agents/triage-labels.md) | The `gh` commands and labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `in-progress`). |
| `.claude/settings.json` | The `SessionStart` hook that runs the sync script, and turns off AI attribution. |
| `scripts/agent-sync.sh`, `scripts/setup.sh` | The sync report and the one-time setup. |

## Reusing this in another project

The pattern doesn't depend on this app. Copy `scripts/agent-sync.sh`, `scripts/setup.sh`, `docs/agents/`, `docs/worklog/README.md`, the `SessionStart` hook, and the "Team coordination" block of `AGENTS.md`, then adapt the labels and repo name. It works with any agent that can read files and run `gh`.
