#!/usr/bin/env sh
#
# install-hooks.sh — ativa os hooks versionados deste repo (npm run hooks:install).
#
# Por que `core.hooksPath` em vez de copiar para .git/hooks: os hooks ficam
# versionados em .githooks/ e passam a valer (e a ser revisados) como qualquer
# outro código. Um hook copiado fica invisível no git e some a cada clone.

set -eu

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "✅ Hooks instalados: core.hooksPath=$(git config --get core.hooksPath)"
echo "   - pre-commit: gitleaks protect --staged (pula se gitleaks ausente)"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo ""
  echo "⚠️  gitleaks não está no PATH. O hook vai pular o scan local."
  echo "    Instale para proteção completa: https://github.com/gitleaks/gitleaks#installing"
fi
