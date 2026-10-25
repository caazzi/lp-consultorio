#!/usr/bin/env sh
#
# install-hooks.sh — enables this repo's versioned hooks (npm run hooks:install).
#
# Why `core.hooksPath` instead of copying into .git/hooks: hooks stay versioned in
# .githooks/ and are therefore reviewed like any other code. A copied hook is
# invisible to git and disappears on every clone.

set -eu

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "✅ Hooks installed: core.hooksPath=$(git config --get core.hooksPath)"
echo "   - pre-commit: gitleaks protect --staged (skipped when gitleaks is missing)"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo ""
  echo "⚠️  gitleaks is not on PATH. The hook will skip the local scan."
  echo "    Install it for full protection: https://github.com/gitleaks/gitleaks#installing"
fi
