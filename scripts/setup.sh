#!/usr/bin/env bash
# One-time team setup. Safe to re-run: skips anything already done.
#   bash scripts/setup.sh          (in Claude Code: ! bash scripts/setup.sh)
set -e
cd "$(git rev-parse --show-toplevel)"

echo "1/3 GitHub CLI"
if command -v gh >/dev/null 2>&1; then
  echo "    already installed"
elif command -v brew >/dev/null 2>&1; then
  brew install gh
else
  echo "    Please install it from https://cli.github.com, then re-run this script."
  exit 1
fi

echo "2/3 GitHub login"
if gh auth status >/dev/null 2>&1; then
  echo "    already logged in"
else
  echo "    A browser window will open. Paste the one-time code shown below."
  gh auth login --hostname github.com --git-protocol https --web
fi

echo "3/3 Repo access"
if gh repo view --json viewerPermission --jq .viewerPermission | grep -qE 'WRITE|MAINTAIN|ADMIN'; then
  echo "    you can push to $(gh repo view --json nameWithOwner --jq .nameWithOwner)"
else
  echo "    You don't have write access yet. Ask the repo owner to add you as a collaborator."
  exit 1
fi

echo
echo "Setup complete. Your agent will now sync with the team automatically."
