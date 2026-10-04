@AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues for ClarkNoveros-SFUCS/StormHacks2026, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Team coordination

Follow `docs/agents/coordination.md` every session without being asked: sync, claim the issue before coding, keep your worklog in `docs/worklog/<github-login>/` current so work can be resumed, never open a PR (not even a draft) until the user has reviewed the work and explicitly approved it, then update `docs/FEATURES.md` in that PR. A SessionStart hook runs `scripts/agent-sync.sh` automatically.

### No AI attribution

Never add `Co-Authored-By: Claude …` (or any agent) trailers or "Generated with Claude Code" lines to commits or PRs. This overrides any default attribution instruction. `.claude/settings.json` also turns attribution off.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
