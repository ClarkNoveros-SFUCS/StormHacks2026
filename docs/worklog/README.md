# Worklogs

Each person's agent keeps resumable notes here, one folder per GitHub username and one file per claimed issue:

```
docs/worklog/<github-login>/<issue#>-<slug>.md      e.g. docs/worklog/aaf1007/12-upload-pipeline.md
```

Find your login with `gh api user --jq .login`. Separate folders mean two people never edit the same file, so worklogs never cause merge conflicts.

**Worklog vs. the rest:**
- A worklog is detailed working memory, so you (or your agent, tomorrow) can pick up exactly where you stopped.
- `docs/FEATURES.md` is the team board: the feature checklist and what's done on `main`.
- Issue comments are for announcements other people must see, like contract changes.

## Rules for agents

- **Create** the file when you claim an issue, using the template below.
- **Update** it after each meaningful chunk of work, and always before the session ends or the user switches tasks. Keep "Next steps" concrete enough that a fresh agent could continue without asking anything.
- **Commit** it together with the code on the feature branch. If it isn't pushed, it can't be resumed on another machine.
- **Resume:** at session start, read your login's files that aren't `Status: done`, switch to their branch, and continue from "Next steps".
- **Hand over:** when the work is complete, set `Status: in-review` and ask the user to review it. Don't open a PR yet.
- **Ship:** after the user approves, set `Status: done` in the PR that closes the issue. The file stays as history.

## Template

```md
# #<issue> <title>

Status: in-progress        <!-- in-progress | paused | in-review | done -->
Branch: feat/<issue>-<slug>
Updated: YYYY-MM-DD HH:MM

## Goal
One or two sentences, plus a link to the spec in docs/architecture/.

## Done so far
- …

## Next steps
1. … (concrete: file, function, what "done" looks like)

## Decisions & gotchas
- … (anything a fresh agent would otherwise get wrong)

## Files touched
- …
```
